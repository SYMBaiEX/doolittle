import { randomUUID } from "node:crypto";
import type { GatewayReceiveResult } from "../../../gateway/receive/types";
import type { AppContext } from "../../../runtime/bootstrap/index";
import {
  createResponseTextAccumulator,
  nextResponseTextFrame,
} from "../../../runtime/run-progress";
import { createApiResponseId } from "../../../services/api-transport-service";
import type { IncomingPlatformMessage } from "../../../types/gateway";
import { invalidJsonObjectBody, readJsonObjectBody } from "../../request-body";
import { json, streamSse } from "../../responses";
import { buildResponsePayload } from "./payload";
import type { ResponsesRequestBody } from "./types";

const UNSUPPORTED_RESPONSES_FIELDS = [
  "model",
  "instructions",
  "tools",
  "tool_choice",
  "reasoning",
  "max_output_tokens",
  "temperature",
  "top_p",
  "truncation",
  "store",
  "include",
  "parallel_tool_calls",
  "background",
] as const;

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

  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) return invalidJsonObjectBody(parsed.reason);
  const body = parsed.value as ResponsesRequestBody;
  const unsupportedField = UNSUPPORTED_RESPONSES_FIELDS.find((field) =>
    Object.hasOwn(parsed.value, field),
  );
  if (unsupportedField) {
    return json(
      {
        error: `${unsupportedField} is not supported by this text-only Responses endpoint`,
      },
      400,
    );
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return json({ error: "stream must be a boolean" }, 400);
  }
  if (body.user !== undefined && typeof body.user !== "string") {
    return json({ error: "user must be a string" }, 400);
  }
  if (
    body.previous_response_id !== undefined &&
    typeof body.previous_response_id !== "string"
  ) {
    return json({ error: "previous_response_id must be a string" }, 400);
  }
  const input = readResponseInput(body.input);
  if ("error" in input) return json({ error: input.error }, 400);
  const inputText = input.text;

  const userId = body.user ?? "api-user";
  const continuation = context.services.apiTransport.resolveContinuation(
    body.previous_response_id,
    userId,
  );
  if (!continuation.ok) {
    return json(
      {
        error: continuation.error,
        code: continuation.code,
      },
      continuation.status,
    );
  }
  const roomId = continuation.roomId;
  const message: IncomingPlatformMessage = {
    platform: "api",
    userId,
    roomId,
    text: inputText,
    messageId: `api-msg-${randomUUID()}`,
    replyToMessageId: body.previous_response_id,
    metadata: { ...body.metadata, apiTransport: "responses" },
  };
  const storeResponse = (result: GatewayReceiveResult, id?: string) =>
    buildResponsePayload(
      context.services.apiTransport.create({
        id,
        input: inputText,
        outputText: result.response,
        userId,
        roomId,
        previousResponseId: body.previous_response_id,
        metadata: {
          ...body.metadata,
          traceId: result.traceId ?? "",
          deliveryId: result.deliveryId ?? "",
        },
      }),
    );

  if (body.stream) {
    const streamResponseId = createApiResponseId();
    const outputItemId = `msg_${randomUUID().replace(/-/gu, "")}`;
    const createdAt = new Date().toISOString();
    const streamAbortController = new AbortController();
    const abortSignal = AbortSignal.any([
      request.signal,
      streamAbortController.signal,
    ]);
    return streamSse(
      async (emit) => {
        let sequenceNumber = 0;
        const emitResponseEvent = async (
          type: string,
          data: Record<string, unknown>,
        ) => {
          await emit(type, {
            type,
            sequence_number: sequenceNumber++,
            ...data,
          });
        };
        const responseAccumulator = createResponseTextAccumulator();
        const pendingResponse = {
          ...buildResponsePayload({
            id: streamResponseId,
            createdAt,
            previousResponseId: body.previous_response_id,
            outputText: "",
            roomId,
          }),
          status: "in_progress",
        };
        await emitResponseEvent("response.created", {
          response: pendingResponse,
        });
        await emitResponseEvent("response.in_progress", {
          response: pendingResponse,
        });
        await emitResponseEvent("response.output_item.added", {
          output_index: 0,
          item: {
            id: outputItemId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        });
        await emitResponseEvent("response.content_part.added", {
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          part: {
            type: "output_text",
            text: "",
            annotations: [],
          },
        });

        try {
          const result = await context.gateway.receive(message, {
            abortSignal,
            onRunEvent: async (event, detail) => {
              await emitResponseEvent("agent.progress", {
                event: event.type,
                detail: `[run] ${detail}`,
                sessionId: event.sessionId,
              });
            },
            onResponseProgress: async ({ response }) => {
              const frame = nextResponseTextFrame(
                responseAccumulator,
                response,
              );
              if (!frame?.delta) {
                return;
              }
              await emitResponseEvent("response.output_text.delta", {
                item_id: outputItemId,
                output_index: 0,
                content_index: 0,
                delta: frame.delta,
              });
            },
          });
          const outputText = result.response;
          const finalFrame = nextResponseTextFrame(
            responseAccumulator,
            outputText,
          );
          if (finalFrame?.delta) {
            await emitResponseEvent("response.output_text.delta", {
              item_id: outputItemId,
              output_index: 0,
              content_index: 0,
              delta: finalFrame.delta,
            });
          }
          const responsePayload = storeResponse(result, streamResponseId);
          if (!result.ok) {
            const deliveryFailed =
              result.agentCompleted && result.deliveryStatus === "rejected";
            await emitResponseEvent("response.failed", {
              response: {
                ...responsePayload,
                status: "failed",
                error: {
                  code: deliveryFailed
                    ? "delivery_failed"
                    : "agent_turn_failed",
                  message: deliveryFailed
                    ? result.deliveryFailure ||
                      "The response could not be delivered."
                    : outputText || "The agent turn failed.",
                },
              },
            });
            return;
          }
          await emitResponseEvent("response.output_text.done", {
            item_id: outputItemId,
            output_index: 0,
            content_index: 0,
            text: outputText,
          });
          const completedPart = {
            type: "output_text",
            text: outputText,
            annotations: [],
          };
          await emitResponseEvent("response.content_part.done", {
            item_id: outputItemId,
            output_index: 0,
            content_index: 0,
            part: completedPart,
          });
          await emitResponseEvent("response.output_item.done", {
            output_index: 0,
            item: {
              id: outputItemId,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [completedPart],
            },
          });
          await emitResponseEvent("response.completed", {
            response: {
              ...responsePayload,
              status: "completed",
            },
          });
        } catch (error) {
          await emitResponseEvent("response.failed", {
            response: {
              ...pendingResponse,
              status: "failed",
              error: {
                code: "agent_turn_failed",
                message: error instanceof Error ? error.message : String(error),
              },
            },
          });
        }
      },
      {
        signal: request.signal,
        onCancel: () => {
          streamAbortController.abort(
            new DOMException(
              "The Responses stream was cancelled.",
              "AbortError",
            ),
          );
        },
      },
    );
  }

  const result = await context.gateway.receive(message, {
    abortSignal: request.signal,
  });
  if (!result.ok) {
    const status =
      result.agentCompleted && result.deliveryStatus === "rejected" ? 502 : 403;
    return json(result, status);
  }
  return json(storeResponse(result));
}

function readResponseInput(
  input: unknown,
): { text: string } | { error: string } {
  if (input === undefined || typeof input === "string") {
    const text = input?.trim();
    return text ? { text } : { error: "input is required" };
  }
  if (!Array.isArray(input))
    return { error: "input must be a string or message array" };

  const lines: string[] = [];
  for (const [index, entry] of input.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `input[${index}] must be an object` };
    }
    const content = (entry as Record<string, unknown>).content;
    if (content === undefined) continue;
    if (typeof content === "string") {
      const text = content.trim();
      if (text) lines.push(text);
      continue;
    }
    if (!Array.isArray(content)) {
      return {
        error: `input[${index}].content must be a string or content-part array`,
      };
    }
    for (const [partIndex, part] of content.entries()) {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        return {
          error: `input[${index}].content[${partIndex}] must be an object`,
        };
      }
      const { type, text } = part as Record<string, unknown>;
      if (type !== undefined && type !== "input_text" && type !== "text") {
        return {
          error: `input content type ${String(type)} is not supported by this text-only Responses endpoint`,
        };
      }
      if (text === undefined) continue;
      if (typeof text !== "string") {
        return {
          error: `input[${index}].content[${partIndex}].text must be a string`,
        };
      }
      const trimmed = text.trim();
      if (trimmed) lines.push(trimmed);
    }
  }
  return lines.length
    ? { text: lines.join("\n") }
    : { error: "input is required" };
}
