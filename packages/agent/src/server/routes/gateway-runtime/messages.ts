import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { IncomingPlatformMessage, PlatformName } from "@/types";
import { readJsonBody } from "./body";
import {
  getGatewayMessageEditValidationError,
  getGatewayProgressiveValidationError,
  getGatewayReplayValidationError,
} from "./validators";

export async function handleGatewayMessageRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/gateway/message") {
    const parsed = await readJsonBody<IncomingPlatformMessage>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const result = await context.gateway.receive(parsed.value);
    return json(result, result.ok ? 200 : 403);
  }

  if (request.method === "POST" && url.pathname === "/gateway/replay") {
    const parsed = await readJsonBody<{ recordId?: string }>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const replayError = getGatewayReplayValidationError(parsed.value);
    if (replayError) {
      return json({ error: replayError }, 400);
    }
    const { recordId } = parsed.value;
    if (!recordId) {
      return json({ error: "recordId is required" }, 400);
    }
    return json({
      result: await context.gateway.replayInbox(recordId),
    });
  }

  if (request.method === "POST" && url.pathname === "/gateway/message/edit") {
    const parsed = await readJsonBody<{
      deliveryId?: string;
      text?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    }>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const editError = getGatewayMessageEditValidationError(parsed.value);
    if (editError) {
      return json({ error: editError }, 400);
    }
    const { deliveryId, text } = parsed.value;
    if (!deliveryId || !text) {
      return json({ error: "deliveryId and text are required." }, 400);
    }
    return json({
      delivery: await context.gateway.editDelivery(deliveryId, text, {
        threadId: parsed.value.threadId,
        replyToId: parsed.value.replyToId,
        metadata: parsed.value.metadata,
      }),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/gateway/message/progressive"
  ) {
    const parsed = await readJsonBody<{
      platform?: PlatformName;
      roomId?: string;
      userId?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
      parts?: string[];
    }>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const progressiveError = getGatewayProgressiveValidationError(parsed.value);
    if (progressiveError) {
      return json({ error: progressiveError }, 400);
    }
    const { platform, roomId, parts } = parsed.value;
    if (!platform || !roomId || !parts) {
      return json(
        {
          error:
            "platform, roomId, and at least two message parts are required.",
        },
        400,
      );
    }
    return json({
      delivery: await context.gateway.sendProgressive(
        {
          platform,
          roomId,
          userId: parsed.value.userId,
          threadId: parsed.value.threadId,
          replyToId: parsed.value.replyToId,
          metadata: parsed.value.metadata,
        },
        parts,
      ),
    });
  }

  return null;
}
