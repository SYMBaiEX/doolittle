import {
  buildGatewayOutboundResponse,
  shouldUseFreshDelivery,
} from "@/gateway/outbound/builders";
import type { SessionRoute } from "@/types/gateway";
import type { GatewayReceiveDependencies } from "./types";

export async function deliverGatewayReceiveResponse(
  deps: GatewayReceiveDependencies & {
    session: SessionRoute;
    response: string;
    traceId: string;
    progressiveDelivery?: { id: string };
  },
): Promise<string | undefined> {
  const at = () => new Date().toISOString();
  deps.pushTrace({
    traceId: deps.traceId,
    at: at(),
    kind: "respond",
    platform: deps.message.platform,
    detail: `Response ready for ${deps.message.platform} session ${deps.session.sessionKey}.`,
    sessionId: deps.session.sessionKey,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    metadataKeys: Object.keys(deps.message.metadata ?? {}),
  });
  await deps.observeAdapter(deps.message.platform, {
    at: at(),
    kind: "respond",
    detail: `Response ready for ${deps.message.platform} session ${deps.session.sessionKey}.`,
  });

  if (deps.adapter) {
    const outbound = await buildGatewayOutboundResponse(
      deps.context.services.media,
      deps.session,
      deps.message,
      {
        roomId: deps.message.channelId ?? deps.message.roomId,
        userId: deps.message.userId,
        text: deps.response,
        threadId: deps.message.threadId ?? deps.session.threadId,
        replyToId: deps.message.messageId ?? deps.message.replyToMessageId,
        metadata: deps.message.metadata,
      },
    );
    try {
      const requiresFreshDelivery = shouldUseFreshDelivery(outbound.metadata);
      const delivery =
        deps.progressiveDelivery && !requiresFreshDelivery
          ? await deps.editDelivery(
              deps.progressiveDelivery.id,
              outbound.text,
              {
                threadId: outbound.threadId,
                replyToId: outbound.replyToId,
                metadata: outbound.metadata,
              },
            )
          : await deps.adapter.send(outbound);
      if (!deps.progressiveDelivery || requiresFreshDelivery) {
        deps.recordOutbox(
          deps.message.platform,
          deps.traceId,
          deps.session.sessionKey,
          delivery,
          outbound,
          "sent",
        );
      }
      deps.pushTrace({
        traceId: deps.traceId,
        at: at(),
        kind: "deliver",
        platform: deps.message.platform,
        detail: `Delivered via ${deps.adapter.name} to ${outbound.roomId} with record ${delivery.id}.`,
        sessionId: deps.session.sessionKey,
        userId: deps.message.userId,
        roomId: deps.message.roomId,
        threadId: outbound.threadId,
        replyToMessageId: outbound.replyToId,
        deliveryId: delivery.id,
        metadataKeys: Object.keys(delivery.metadata ?? {}),
      });
      await deps.observeAdapter(deps.message.platform, {
        at: at(),
        kind: "deliver",
        detail: `Delivered via ${deps.adapter.name} to ${outbound.roomId} with record ${delivery.id}.`,
      });
      return delivery.id;
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : `Delivery via ${deps.adapter.name} failed.`;
      deps.pushTrace({
        traceId: deps.traceId,
        at: at(),
        kind: "reject",
        platform: deps.message.platform,
        detail,
        sessionId: deps.session.sessionKey,
        userId: deps.message.userId,
        roomId: deps.message.roomId,
      });
      await deps.observeAdapter(deps.message.platform, {
        at: at(),
        kind: "reject",
        detail,
      });
      throw error;
    }
  }

  const outbound = await buildGatewayOutboundResponse(
    deps.context.services.media,
    deps.session,
    deps.message,
    {
      roomId: deps.message.channelId ?? deps.message.roomId,
      userId: deps.message.userId,
      text: deps.response,
      threadId: deps.message.threadId,
      replyToId: deps.message.replyToMessageId,
      metadata: deps.message.metadata,
    },
  );
  const delivery = deps.context.services.delivery.deliver(
    {
      platform: deps.message.platform,
      channelId: outbound.roomId,
      userId: deps.message.userId,
      mode: "origin",
    },
    outbound.text,
    {
      threadId: outbound.threadId,
      replyToId: outbound.replyToId,
      metadata: outbound.metadata,
    },
  );
  deps.recordOutbox(
    deps.message.platform,
    deps.traceId,
    deps.session.sessionKey,
    delivery,
    outbound,
    "fallback",
  );
  deps.pushTrace({
    traceId: deps.traceId,
    at: at(),
    kind: "deliver",
    platform: deps.message.platform,
    detail: `Delivered via fallback history with record ${delivery.id}.`,
    sessionId: deps.session.sessionKey,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    deliveryId: delivery.id,
    metadataKeys: Object.keys(delivery.metadata ?? {}),
  });
  await deps.observeAdapter(deps.message.platform, {
    at: at(),
    kind: "deliver",
    detail: `Delivered via fallback history with record ${delivery.id}.`,
  });
  return delivery.id;
}
