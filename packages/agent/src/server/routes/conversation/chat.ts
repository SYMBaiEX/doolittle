import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import { readJsonObjectBody } from "@/server/request-body";
import { json, streamSse } from "@/server/responses";
import { resolveRuntimeWorkspacePath } from "@/server/routes/runtime/workspace";
import {
  ManagedAttachmentError,
  resolveManagedChatAttachments,
} from "@/services/chat-attachments";
import type { TaskRunEvent } from "@/services/run-controller-service";
import type { ChatRequestBody } from "./types";

const RUN_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const TURN_FAILURE_MESSAGE =
  "The response could not be completed. Please try again.";

interface PreparedChatRun {
  body: ChatRequestBody;
  message: string;
  attachments: Awaited<ReturnType<typeof resolveManagedChatAttachments>>;
  workspaceDir: string;
  runId: string;
  responseId: string;
  roomId: string;
  sessionId: string;
}

function failedTurnMessage(
  context: AppContext,
  runId: string,
): string | undefined {
  return context.services.runController.getByRunId(runId)?.status === "error"
    ? TURN_FAILURE_MESSAGE
    : undefined;
}

function resolveRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    return randomUUID();
  }
  return value;
}

function resolveRoomId(body: ChatRequestBody): string {
  return body.roomId ?? `api:${body.userId ?? "api-user"}`;
}

function assignProjectForNewSession(
  context: AppContext,
  sessionId: string,
  projectId: string | undefined,
): boolean {
  if (!projectId) return true;
  if (context.services.sessions.countBySessionRole(sessionId) > 0) return true;
  return context.services.sessions.assignSessionProject(sessionId, projectId);
}

function resolveChatWorkspace(
  context: AppContext,
  requestedWorkspaceDir: string | undefined,
): string | Response {
  const activeWorkspaceDir = resolveRuntimeWorkspacePath(
    context.config.workspaceDir,
  );
  if (!requestedWorkspaceDir) return activeWorkspaceDir;
  let canonicalRequestedWorkspaceDir: string;
  try {
    canonicalRequestedWorkspaceDir = resolveRuntimeWorkspacePath(
      requestedWorkspaceDir,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "workspaceDir must be a valid absolute directory path.",
      },
      400,
    );
  }
  if (canonicalRequestedWorkspaceDir !== activeWorkspaceDir) {
    return json(
      {
        error:
          "The requested chat workspace is no longer active. Switch back to it before sending this message.",
        code: "workspace_mismatch",
      },
      409,
    );
  }
  return activeWorkspaceDir;
}

async function prepareChatRun(
  context: AppContext,
  request: Request,
): Promise<PreparedChatRun | Response> {
  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) {
    return json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "request body must be valid JSON"
            : "request body must be a JSON object",
      },
      400,
    );
  }
  const body = parsed.value as ChatRequestBody;
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return json({ error: "stream must be a boolean" }, 400);
  }
  for (const field of ["userId", "roomId", "source", "workspaceDir"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return json({ error: `${field} must be a string` }, 400);
    }
  }
  if (
    body.attachmentIds !== undefined &&
    (!Array.isArray(body.attachmentIds) ||
      body.attachmentIds.some(
        (attachmentId) => typeof attachmentId !== "string",
      ))
  ) {
    return json({ error: "attachmentIds must be an array of strings" }, 400);
  }
  if (
    body.projectId !== undefined &&
    (typeof body.projectId !== "string" ||
      !PROJECT_ID_PATTERN.test(body.projectId))
  ) {
    return json({ error: "projectId is invalid" }, 400);
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return json({ error: "message is required" }, 400);
  }
  const message = body.message.trim();
  let attachments: Awaited<ReturnType<typeof resolveManagedChatAttachments>>;
  try {
    attachments = await resolveManagedChatAttachments({
      dataDir: context.config.dataDir,
      attachmentIds: body.attachmentIds ?? [],
    });
  } catch (error) {
    if (error instanceof ManagedAttachmentError) {
      return json({ error: error.message, code: error.code }, 400);
    }
    throw error;
  }
  if (
    attachments.length > 0 &&
    (message.startsWith("/") || message.startsWith("!"))
  ) {
    return json({ error: "Command messages cannot include attachments." }, 400);
  }
  const workspaceDir = resolveChatWorkspace(context, body.workspaceDir);
  if (workspaceDir instanceof Response) return workspaceDir;
  const roomId = resolveRoomId(body);
  if (!assignProjectForNewSession(context, roomId, body.projectId)) {
    return json({ error: "project not found or archived" }, 404);
  }
  return {
    body,
    message,
    attachments,
    workspaceDir,
    runId: resolveRunId(body.runId),
    responseId: randomUUID(),
    roomId,
    sessionId: roomId,
  };
}

function conflictResponse(
  reason: "run_exists" | "session_active",
  conflictingRunId?: string,
): Response {
  return reason === "run_exists"
    ? json(
        { error: "This chat run already exists.", code: "run_already_exists" },
        409,
      )
    : json(
        {
          error: "This chat session already has an active run.",
          code: "session_run_active",
          conflictingRunId,
        },
        409,
      );
}

function startServerOwnedChatRun(
  context: AppContext,
  prepared: PreparedChatRun,
): Response | undefined {
  const { body, message, runId, responseId, roomId, sessionId, workspaceDir } =
    prepared;
  const claim = context.services.runController.claimTaskRun({
    runId,
    responseId,
    roomId,
    sessionId,
    source: body.source ?? "api",
  });
  if (!claim.accepted) {
    return conflictResponse(claim.reason, claim.conflictingRunId);
  }

  let releaseWorkspace: () => void;
  try {
    releaseWorkspace = context.services.runController.registerWorkspaceRun(
      runId,
      workspaceDir,
    );
  } catch {
    context.services.runController.releaseTaskRun(runId);
    return conflictResponse("run_exists");
  }

  const controller = new AbortController();
  const unregisterController =
    context.services.runController.registerAbortController(runId, controller);
  context.services.runController.appendTaskEvent(runId, "response.created", {
    id: responseId,
    run_id: runId,
    room_id: roomId,
  });

  void (async () => {
    try {
      const attachments = prepared.attachments.map((entry) => entry.media);
      const attachmentDescriptors = prepared.attachments.map(
        (entry) => entry.descriptor,
      );
      const { response } = await executeAgentTurnWithProgress(
        {
          message,
          userId: body.userId ?? "api-user",
          roomId,
          runId,
          source: body.source ?? "api",
          attachments,
          attachmentDescriptors,
        },
        context,
        {
          abortSignal: controller.signal,
          onProgress: ({ delta }) => {
            if (!delta) return;
            context.services.runController.appendTaskEvent(
              runId,
              "response.output_text.delta",
              {
                id: responseId,
                delta,
              },
            );
          },
          onRunUpdate: (event) => {
            context.services.runController.appendTaskEvent(
              runId,
              "agent.run",
              event,
            );
          },
          onRunEvent: (event, detail) => {
            context.services.runController.appendTaskEvent(
              runId,
              "agent.progress",
              {
                event: event.type,
                detail: `[run] ${detail}`,
                sessionId: event.sessionId,
              },
            );
          },
          onNotice: (notice) => {
            context.services.runController.appendTaskEvent(
              runId,
              "response.notice",
              notice,
            );
          },
        },
      );
      if (controller.signal.aborted) {
        context.services.runController.appendTaskEvent(
          runId,
          "response.cancelled",
          { id: responseId, run_id: runId, room_id: roomId },
          true,
        );
      } else {
        const failureMessage = failedTurnMessage(context, runId);
        if (failureMessage) {
          context.services.runController.appendTaskEvent(
            runId,
            "response.failed",
            {
              id: responseId,
              run_id: runId,
              room_id: roomId,
              message: failureMessage,
            },
            true,
          );
        } else {
          context.services.runController.appendTaskEvent(
            runId,
            "response.completed",
            {
              id: responseId,
              response,
              character: context.config.agentName,
              room_id: roomId,
            },
            true,
          );
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        context.services.runController.appendTaskEvent(
          runId,
          "response.cancelled",
          { id: responseId, run_id: runId, room_id: roomId },
          true,
        );
      } else {
        const active = context.services.runController.getActive(sessionId);
        if (active?.runId === runId) {
          context.services.runController.finishTurn(
            sessionId,
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
        context.services.runController.appendTaskEvent(
          runId,
          "response.failed",
          {
            id: responseId,
            run_id: runId,
            room_id: roomId,
            message: TURN_FAILURE_MESSAGE,
          },
          true,
        );
      }
    } finally {
      const active = context.services.runController.getActive(sessionId);
      if (controller.signal.aborted && active?.runId === runId) {
        context.services.runController.finishTurn(sessionId, "cancelled");
      }
      unregisterController();
      releaseWorkspace();
      context.services.runController.releaseTaskRun(runId);
    }
  })();
  return undefined;
}

function resolveAfterCursor(request: Request, url?: URL): number {
  const parsedUrl = url ?? new URL(request.url);
  const raw =
    parsedUrl.searchParams.get("after") ?? request.headers.get("last-event-id");
  const cursor = Number(raw ?? "0");
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

export function handleChatRunEventsRoute(
  context: AppContext,
  request: Request,
  runId: string,
  url?: URL,
): Response {
  if (context.services.runController.getTaskEvents(runId).length === 0) {
    return json({ error: "run not found" }, 404);
  }
  const after = resolveAfterCursor(request, url);
  let detach = false;
  let wake: (() => void) | undefined;
  const detachSubscriber = () => {
    detach = true;
    wake?.();
  };
  if (request.signal.aborted) {
    detachSubscriber();
  } else {
    request.signal.addEventListener("abort", detachSubscriber, { once: true });
  }
  return streamSse(
    async (emit) => {
      const queue: TaskRunEvent[] = [];
      const unsubscribe = context.services.runController.onTaskEvent(
        (event) => {
          if (event.runId !== runId || event.id <= after) return;
          queue.push(event);
          wake?.();
        },
      );
      let cursor = after;
      const send = async (event: TaskRunEvent): Promise<boolean> => {
        if (event.id <= cursor) return event.terminal;
        cursor = event.id;
        const data =
          event.data && typeof event.data === "object"
            ? event.data
            : { value: event.data };
        await emit(event.type, { event_id: event.id, ...data });
        return event.terminal;
      };
      try {
        for (const event of context.services.runController.getTaskEvents(
          runId,
          after,
        )) {
          if (await send(event)) return;
        }
        while (!detach) {
          while (queue.length > 0) {
            const event = queue.shift();
            if (event && (await send(event))) return;
          }
          if (context.services.runController.getTerminalTaskEvent(runId))
            return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
      } finally {
        unsubscribe();
        request.signal.removeEventListener("abort", detachSubscriber);
      }
    },
    {
      onCancel: detachSubscriber,
    },
  );
}

async function waitForTerminalEvent(
  context: AppContext,
  runId: string,
): Promise<TaskRunEvent> {
  const existing = context.services.runController.getTerminalTaskEvent(runId);
  if (existing) return existing;
  return new Promise((resolve) => {
    const unsubscribe = context.services.runController.onTaskEvent((event) => {
      if (event.runId !== runId || !event.terminal) return;
      unsubscribe();
      resolve(event);
    });
  });
}

export async function handleChatSubmitRoute(
  context: AppContext,
  request: Request,
): Promise<Response> {
  const prepared = await prepareChatRun(context, request);
  if (prepared instanceof Response) return prepared;
  const conflict = startServerOwnedChatRun(context, prepared);
  if (conflict) return conflict;
  return json(
    {
      run_id: prepared.runId,
      response_id: prepared.responseId,
      room_id: prepared.roomId,
      events_url: `/chat/runs/${prepared.runId}/events`,
    },
    202,
  );
}

export async function handleChatRoute(
  context: AppContext,
  request: Request,
): Promise<Response> {
  const prepared = await prepareChatRun(context, request);
  if (prepared instanceof Response) return prepared;
  const conflict = startServerOwnedChatRun(context, prepared);
  if (conflict) return conflict;
  if (prepared.body.stream) {
    return handleChatRunEventsRoute(
      context,
      request,
      prepared.runId,
      new URL(request.url),
    );
  }
  const terminal = await waitForTerminalEvent(context, prepared.runId);
  if (terminal.type === "response.completed") {
    const data = terminal.data as { response?: string; character?: string };
    return json({
      response: data.response ?? "",
      character: data.character ?? context.config.agentName,
    });
  }
  if (terminal.type === "response.cancelled") {
    return json({ error: "run cancelled", code: "run_cancelled" }, 409);
  }
  return json({ error: TURN_FAILURE_MESSAGE, code: "turn_failed" }, 500);
}
