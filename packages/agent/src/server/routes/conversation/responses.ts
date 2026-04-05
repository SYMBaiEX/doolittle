import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import {
  createResponseTextAccumulator,
  formatRunEvent,
  nextResponseTextFrame,
  shouldRenderRunEvent,
} from "@/runtime/run-progress";
import { json, sse, streamSse } from "@/server/responses";
import type { RunUpdateEvent } from "@/services/run-controller-service";
import { buildResponsePayload } from "./payload";
import type { ResponsesRequestBody } from "./types";

export async function handleResponsesRoute(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/v1/responses") {
    return json({
      data: context.services.apiTransport
        .list(Number(url.searchParams.get("limit") ?? "25"))
        .map((record) => buildResponsePayload(record)),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/v1/responses/") &&
    url.pathname !== "/v1/responses/"
  ) {
    const id = url.pathname.replace("/v1/responses/", "").trim();
    if (!id) {
      return json({ error: "response id is required" }, 400);
    }

    const record = context.services.apiTransport.get(id);
    if (!record) {
      return json({ error: "response not found" }, 404);
    }

    return json(buildResponsePayload(record));
  }

  if (request.method !== "POST" || url.pathname !== "/v1/responses") {
    return null;
  }

  const body = (await request.json()) as ResponsesRequestBody;
  const inputText = Array.isArray(body.input)
    ? body.input
        .map((entry) => entry.content ?? "")
        .filter(Boolean)
        .join("\n")
    : body.input;

  if (!inputText) {
    return json({ error: "input is required" }, 400);
  }

  const userId = body.user ?? "api-user";
  const roomId = context.services.apiTransport.resolveRoomId(
    body.previous_response_id,
    userId,
  );

  if (body.stream) {
    const streamResponseId = randomUUID();
    return streamSse(async (emit) => {
      const responseAccumulator = createResponseTextAccumulator();
      let observedRunSessionId: string | undefined;
      const emitRunUpdates = async (event: RunUpdateEvent): Promise<void> => {
        if (observedRunSessionId && event.sessionId !== observedRunSessionId) {
          return;
        }
        if (!observedRunSessionId) {
          if (event.run.source === "api" && event.run.message === inputText) {
            observedRunSessionId = event.sessionId;
          } else {
            return;
          }
        }
        if (!shouldRenderRunEvent(event.run.progressMode, event)) {
          return;
        }
        const detail = formatRunEvent(event);
        if (!detail) {
          return;
        }
        await emit("agent.progress", {
          event: event.type,
          detail: `[run] ${detail}`,
          sessionId: event.sessionId,
        });
      };
      const result = await context.gateway.receive(
        {
          platform: "api",
          userId,
          roomId,
          text: inputText,
          messageId: `api-msg-${Date.now()}`,
          replyToMessageId: body.previous_response_id,
          metadata: {
            ...(body.metadata ?? {}),
            apiTransport: "responses",
          },
        },
        {
          onRunUpdate: emitRunUpdates,
          onResponseProgress: async ({ response }) => {
            const frame = nextResponseTextFrame(responseAccumulator, response);
            if (!frame?.delta) {
              return;
            }
            await emit("response.output_text.delta", {
              id: streamResponseId,
              delta: frame.delta,
            });
          },
        },
      );
      const outputText = result.response;
      const finalFrame = nextResponseTextFrame(responseAccumulator, outputText);
      if (finalFrame?.delta) {
        await emit("response.output_text.delta", {
          id: streamResponseId,
          delta: finalFrame.delta,
        });
      }
      if (outputText && !result.ok) {
        await emit("agent.progress", {
          event: "response.error",
          detail: outputText,
        });
      }
      const record = context.services.apiTransport.create({
        input: inputText,
        outputText,
        userId,
        roomId,
        previousResponseId: body.previous_response_id,
        metadata: {
          ...(body.metadata ?? {}),
          traceId: result.traceId ?? "",
          deliveryId: result.deliveryId ?? "",
        },
      });
      const responsePayload = buildResponsePayload(record);
      await emit("response.created", {
        id: record.id,
        room_id: record.roomId,
      });
      await emit("response.completed", responsePayload);
    });
  }

  const result = await context.gateway.receive({
    platform: "api",
    userId,
    roomId,
    text: inputText,
    messageId: `api-msg-${Date.now()}`,
    replyToMessageId: body.previous_response_id,
    metadata: {
      ...(body.metadata ?? {}),
      apiTransport: "responses",
    },
  });
  const record = context.services.apiTransport.create({
    input: inputText,
    outputText: result.response,
    userId,
    roomId,
    previousResponseId: body.previous_response_id,
    metadata: {
      ...(body.metadata ?? {}),
      traceId: result.traceId ?? "",
      deliveryId: result.deliveryId ?? "",
    },
  });
  const responsePayload = buildResponsePayload(record);

  if (body.stream) {
    return sse([
      {
        event: "response.created",
        data: { id: record.id, room_id: record.roomId },
      },
      {
        event: "response.output_text.delta",
        data: { id: record.id, delta: record.outputText },
      },
      {
        event: "response.completed",
        data: responsePayload,
      },
    ]);
  }

  return json(responsePayload);
}
