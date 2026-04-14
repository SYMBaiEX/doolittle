import { randomUUID } from "node:crypto";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
} from "@/types/gateway";
import type {
  GatewayProgressiveDeliveryDependencies,
  GatewayProgressiveDeliveryTarget,
} from "./dispatch-types";

function normalizeProgressiveParts(parts: string[]): string[] {
  return parts.map((part) => part.trim()).filter(Boolean);
}

function createInitialProgressiveMessage(
  target: GatewayProgressiveDeliveryTarget,
  text: string,
  totalParts: number,
): OutboundPlatformMessage {
  return {
    roomId: target.roomId,
    userId: target.userId,
    text,
    threadId: target.threadId,
    replyToId: target.replyToId,
    metadata: {
      ...(target.metadata ?? {}),
      progressive: "true",
      progressiveStep: "1",
      progressiveTotal: String(totalParts),
    },
  };
}

function createProgressiveEditMetadata(
  target: GatewayProgressiveDeliveryTarget,
  step: number,
  totalParts: number,
): Record<string, string> {
  return {
    ...(target.metadata ?? {}),
    progressive: "true",
    progressiveStep: String(step),
    progressiveTotal: String(totalParts),
  };
}

function recordProgressiveStartTrace(params: {
  deps: GatewayProgressiveDeliveryDependencies;
  traceId: string;
  target: GatewayProgressiveDeliveryTarget;
  delivery: DeliveredMessageRecord;
}) {
  const { deps, traceId, target, delivery } = params;
  deps.pushTrace({
    traceId,
    at: new Date().toISOString(),
    kind: "deliver",
    platform: target.platform,
    detail: `Started progressive delivery ${delivery.id} on ${target.platform}.`,
    userId: target.userId,
    roomId: target.roomId,
    threadId: target.threadId,
    replyToMessageId: target.replyToId,
    deliveryId: delivery.id,
    metadataKeys: Object.keys(delivery.metadata ?? {}),
  });
}

export async function sendProgressiveOutbound(
  target: GatewayProgressiveDeliveryTarget,
  parts: string[],
  deps: GatewayProgressiveDeliveryDependencies,
): Promise<DeliveredMessageRecord> {
  const normalizedParts = normalizeProgressiveParts(parts);
  const [first, ...rest] = normalizedParts;

  if (!first) {
    throw new Error("Progressive delivery requires at least one message part.");
  }

  const adapter = deps.getAdapter(target.platform);
  const traceId = randomUUID();
  const initialMessage = createInitialProgressiveMessage(
    target,
    first,
    normalizedParts.length,
  );
  let delivery = adapter
    ? await adapter.send(initialMessage)
    : deps.fallbackDeliver(
        {
          platform: target.platform,
          channelId: target.roomId,
          userId: target.userId,
          mode: "explicit",
        },
        initialMessage.text,
        {
          threadId: initialMessage.threadId,
          replyToId: initialMessage.replyToId,
          metadata: initialMessage.metadata,
        },
      );

  deps.recordOutbox(
    target.platform,
    traceId,
    undefined,
    delivery,
    initialMessage,
    adapter ? "sent" : "fallback",
  );
  recordProgressiveStartTrace({ deps, traceId, target, delivery });

  for (const [index, part] of rest.entries()) {
    delivery = await deps.editDelivery(delivery.id, part, {
      threadId: target.threadId,
      replyToId: target.replyToId,
      metadata: createProgressiveEditMetadata(
        target,
        index + 2,
        normalizedParts.length,
      ),
    });
  }

  return delivery;
}
