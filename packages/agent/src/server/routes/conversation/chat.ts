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
import { followAbortSignal } from "./lifecycle";
import type { ChatRequestBody } from "./types";

const RUN_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const TURN_FAILURE_MESSAGE =
  "The response could not be completed. Please try again.";

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

function registerWorkspaceRun(
  context: AppContext,
  runId: string,
  workspaceDir: string,
): (() => void) | Response {
  try {
    return context.services.runController.registerWorkspaceRun(
      runId,
      workspaceDir,
    );
  } catch {
    return json(
      {
        error: "This chat run is already active.",
        code: "run_already_active",
      },
      409,
    );
  }
}

export async function handleChatRoute(
  context: AppContext,
  request: Request,
): Promise<Response> {
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

  if (typeof body.message !== "string" || !body.message) {
    return json({ error: "message is required" }, 400);
  }
  const message = body.message.trim();
  if (!message) {
    return json({ error: "message is required" }, 400);
  }

  let resolvedAttachments: Awaited<
    ReturnType<typeof resolveManagedChatAttachments>
  >;
  try {
    resolvedAttachments = await resolveManagedChatAttachments({
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
    resolvedAttachments.length > 0 &&
    (message.startsWith("/") || message.startsWith("!"))
  ) {
    return json({ error: "Command messages cannot include attachments." }, 400);
  }
  const attachments = resolvedAttachments.map((entry) => entry.media);
  const attachmentDescriptors = resolvedAttachments.map(
    (entry) => entry.descriptor,
  );
  const workspaceDir = resolveChatWorkspace(context, body.workspaceDir);
  if (workspaceDir instanceof Response) return workspaceDir;

  if (body.stream) {
    const responseId = randomUUID();
    const runId = resolveRunId(body.runId);
    const roomId = resolveRoomId(body);
    const requestMessage = message;
    const sessionId = roomId;
    if (!assignProjectForNewSession(context, sessionId, body.projectId)) {
      return json({ error: "project not found or archived" }, 404);
    }
    const releaseWorkspace = registerWorkspaceRun(context, runId, workspaceDir);
    if (releaseWorkspace instanceof Response) return releaseWorkspace;

    const controller = new AbortController();
    const stopFollowingRequest = followAbortSignal(request.signal, controller);
    return streamSse(
      async (emit) => {
        const unregister =
          context.services.runController.registerAbortController(
            runId,
            controller,
          );
        await emit("response.created", {
          id: responseId,
          run_id: runId,
          room_id: roomId,
        });
        try {
          const { response } = await executeAgentTurnWithProgress(
            {
              message: requestMessage,
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
              onProgress: async ({ delta, response }) => {
                if (!delta) {
                  return;
                }
                await emit("response.output_text.delta", {
                  id: responseId,
                  delta,
                  response,
                });
              },
              onRunUpdate: async (event) => {
                await emit("agent.run", event);
              },
              onRunEvent: async (event, detail) => {
                await emit("agent.progress", {
                  event: event.type,
                  detail: `[run] ${detail}`,
                  sessionId: event.sessionId,
                });
              },
              onNotice: async (notice) => {
                await emit("response.notice", notice);
              },
            },
          );
          if (controller.signal.aborted) {
            await emit("response.cancelled", {
              id: responseId,
              run_id: runId,
              room_id: roomId,
            });
            return;
          }
          const failureMessage = failedTurnMessage(context, runId);
          if (failureMessage) {
            await emit("response.failed", {
              id: responseId,
              run_id: runId,
              room_id: roomId,
              message: failureMessage,
            });
            return;
          }
          await emit("response.completed", {
            id: responseId,
            response,
            character: context.config.agentName,
            room_id: roomId,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            await emit("response.cancelled", {
              id: responseId,
              run_id: runId,
              room_id: roomId,
            });
            return;
          }
          throw error;
        } finally {
          unregister();
          releaseWorkspace();
          stopFollowingRequest();
        }
      },
      {
        onCancel: () => controller.abort(),
      },
    );
  }

  const roomId = resolveRoomId(body);
  const sessionId = roomId;
  if (!assignProjectForNewSession(context, sessionId, body.projectId)) {
    return json({ error: "project not found or archived" }, 404);
  }
  const runId = resolveRunId(body.runId);
  const releaseWorkspace = registerWorkspaceRun(context, runId, workspaceDir);
  if (releaseWorkspace instanceof Response) return releaseWorkspace;
  const controller = new AbortController();
  const stopFollowingRequest = followAbortSignal(request.signal, controller);
  const unregister = context.services.runController.registerAbortController(
    runId,
    controller,
  );
  let response: string;
  try {
    ({ response } = await executeAgentTurnWithProgress(
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
      { abortSignal: controller.signal },
    ));
  } finally {
    unregister();
    releaseWorkspace();
    stopFollowingRequest();
  }

  const failureMessage = failedTurnMessage(context, runId);
  if (failureMessage) {
    return json({ error: failureMessage, code: "turn_failed" }, 500);
  }

  return json({
    response,
    character: context.config.agentName,
  });
}
