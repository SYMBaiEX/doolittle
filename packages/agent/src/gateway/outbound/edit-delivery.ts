import { randomUUID } from "node:crypto";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
} from "@/types/gateway";
import type {
  GatewayEditDeliveryDependencies,
  GatewayEditDeliveryOptions,
} from "./dispatch-types";

function createFallbackEditOptions(
  delivery: DeliveredMessageRecord,
  message: OutboundPlatformMessage,
): GatewayEditDeliveryOptions {
  return {
    threadId: message.threadId,
    replyToId: message.replyToId,
    metadata: {
      ...(delivery.metadata ?? {}),
      ...(message.metadata ?? {}),
      editedLocally: "true",
    },
  };
}

function recordDeliveryUpdateTrace(params: {
  deps: GatewayEditDeliveryDependencies;
  traceId: string;
  deliveryId: string;
  platform: DeliveredMessageRecord["target"]["platform"];
  sessionId: string | undefined;
  message: OutboundPlatformMessage;
  updated: DeliveredMessageRecord;
}) {
  const { deps, traceId, deliveryId, platform, sessionId, message, updated } =
    params;
  deps.pushTrace({
    traceId,
    at: new Date().toISOString(),
    kind: "update",
    platform,
    detail: `Updated delivery ${deliveryId} on ${platform}.`,
    sessionId,
    userId: message.userId,
    roomId: message.roomId,
    threadId: message.threadId,
    replyToMessageId: message.replyToId,
    deliveryId: updated.id,
    metadataKeys: Object.keys(updated.metadata ?? {}),
  });
}

export async function editDeliveryOutbound(
  deliveryId: string,
  text: string,
  options: GatewayEditDeliveryOptions | undefined,
  deps: GatewayEditDeliveryDependencies,
): Promise<DeliveredMessageRecord> {
  const delivery = deps.getDelivery(deliveryId);
  if (!delivery) {
    throw new Error(`Delivery ${deliveryId} was not found.`);
  }

  const platform = delivery.target.platform;
  const traceId = randomUUID();
  const sessionId = deps.getOutboxSessionIdByDeliveryId(delivery.id);
  const message = deps.buildOutboundFromDelivery(delivery, text, options);
  const adapter = deps.getAdapter(platform);
  const updated = adapter?.edit
    ? await adapter.edit(delivery, message)
    : await deps.fallbackUpdate(
        delivery.id,
        message.text,
        createFallbackEditOptions(delivery, message),
      );

  deps.recordOutbox(platform, traceId, sessionId, updated, message, "edited");
  recordDeliveryUpdateTrace({
    deps,
    traceId,
    deliveryId,
    platform,
    sessionId,
    message,
    updated,
  });
  await deps.observeAdapter(platform, {
    at: new Date().toISOString(),
    kind: "edit",
    detail: `Updated delivery ${deliveryId} on ${platform}.`,
  });
  await deps.snapshotState("edit", 20);
  return updated;
}
