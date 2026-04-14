import { randomUUID } from "node:crypto";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  SessionRoute,
} from "@/types/gateway";
import type {
  GatewaySendToHomesDependencies,
  GatewaySendToHomesOptions,
} from "./dispatch-types";

function createSessionOutboundMessage(
  session: SessionRoute,
  text: string,
  metadata: Record<string, string> | undefined,
): OutboundPlatformMessage {
  const roomId = session.channelId ?? session.roomId;
  return {
    roomId,
    userId: session.userId,
    text,
    threadId: session.threadId,
    replyToId: session.replyToMessageId,
    metadata,
  };
}

function recordHomeDeliveryTrace(params: {
  deps: GatewaySendToHomesDependencies;
  traceId: string;
  session: SessionRoute;
  outbound: OutboundPlatformMessage;
  delivery: DeliveredMessageRecord;
}) {
  const { deps, traceId, session, outbound, delivery } = params;
  deps.pushTrace({
    traceId,
    at: new Date().toISOString(),
    kind: "deliver",
    platform: session.platform,
    detail: `Delivered to home channel ${outbound.roomId} with record ${delivery.id}.`,
    sessionId: session.sessionKey,
    userId: session.userId,
    roomId: session.channelId ?? session.roomId,
    threadId: outbound.threadId,
    replyToMessageId: outbound.replyToId,
    deliveryId: delivery.id,
    metadataKeys: Object.keys(delivery.metadata ?? {}),
  });
}

export async function sendToHomesOutbound(
  text: string,
  options: GatewaySendToHomesOptions | undefined,
  deps: GatewaySendToHomesDependencies,
): Promise<DeliveredMessageRecord[]> {
  const deliveries: DeliveredMessageRecord[] = [];
  const platforms = options?.platforms?.length
    ? new Set(options.platforms)
    : null;
  const homeSessions = deps.listHomeSessions(platforms);

  for (const session of homeSessions) {
    const traceId = randomUUID();
    const message = createSessionOutboundMessage(
      session,
      text,
      options?.metadata,
    );
    const outbound = await deps.buildOutboundForSession(
      session,
      message,
      options?.name ?? "home-delivery",
    );
    const adapter = deps.getAdapter(session.platform);
    const delivery = adapter
      ? await adapter.send(outbound)
      : deps.fallbackDeliver(
          {
            platform: session.platform,
            channelId: outbound.roomId,
            userId: session.userId,
            mode: "home",
          },
          outbound.text,
          {
            threadId: outbound.threadId,
            replyToId: outbound.replyToId,
            metadata: outbound.metadata,
          },
        );

    deliveries.push(delivery);
    deps.recordOutbox(
      session.platform,
      traceId,
      session.sessionKey,
      delivery,
      outbound,
      adapter ? "sent" : "fallback",
    );
    recordHomeDeliveryTrace({ deps, traceId, session, outbound, delivery });
  }

  return deliveries;
}
