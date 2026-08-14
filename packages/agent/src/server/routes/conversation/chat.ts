import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import { readJsonObjectBody } from "@/server/request-body";
import { json, streamSse } from "@/server/responses";
import {
  ManagedAttachmentError,
  resolveManagedChatAttachments,
} from "@/services/chat-attachments";
import { followAbortSignal } from "./lifecycle";
import type { ChatRequestBody } from "./types";

const RUN_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;

function resolveRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    return randomUUID();
  }
  return value;
}

function resolveRoomId(body: ChatRequestBody): string {
  return body.roomId ?? `api:${body.userId ?? "api-user"}`;
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

  if (body.stream) {
    const responseId = randomUUID();
    const runId = resolveRunId(body.runId);
    const roomId = resolveRoomId(body);
    const requestMessage = message;
    const sessionId = roomId;
    if (
      body.projectId &&
      !context.services.sessions.assignSessionProject(sessionId, body.projectId)
    ) {
      return json({ error: "project not found or archived" }, 404);
    }

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
              onProgress: async ({ delta }) => {
                if (!delta) {
                  return;
                }
                await emit("response.output_text.delta", {
                  id: responseId,
                  delta,
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
  if (
    body.projectId &&
    !context.services.sessions.assignSessionProject(sessionId, body.projectId)
  ) {
    return json({ error: "project not found or archived" }, 404);
  }
  const runId = resolveRunId(body.runId);
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
    stopFollowingRequest();
  }

  return json({
    response,
    character: context.config.agentName,
  });
}
