import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import { json, streamSse } from "@/server/responses";
import type { ChatRequestBody } from "./types";

export async function handleChatRoute(
  context: AppContext,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as ChatRequestBody;

  if (!body.message) {
    return json({ error: "message is required" }, 400);
  }

  if (body.stream) {
    const responseId = randomUUID();
    const roomId = body.roomId ?? `api:${body.userId ?? "api-user"}`;
    const requestMessage = body.message;

    return streamSse(async (emit) => {
      await emit("response.created", { id: responseId, room_id: roomId });
      const { response } = await executeAgentTurnWithProgress(
        {
          message: requestMessage,
          userId: body.userId ?? "api-user",
          roomId,
          source: body.source ?? "api",
        },
        context,
        {
          onProgress: async ({ delta }) => {
            if (!delta) {
              return;
            }
            await emit("response.output_text.delta", {
              id: responseId,
              delta,
            });
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
      await emit("response.completed", {
        id: responseId,
        response,
        character: context.config.agentName,
        room_id: roomId,
      });
    });
  }

  const { response } = await executeAgentTurnWithProgress(
    {
      message: body.message,
      userId: body.userId ?? "api-user",
      roomId: body.roomId,
      source: body.source ?? "api",
    },
    context,
  );

  return json({
    response,
    character: context.config.agentName,
  });
}
