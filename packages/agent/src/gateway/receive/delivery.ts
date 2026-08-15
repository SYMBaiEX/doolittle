import {
  buildGatewayOutboundResponse,
  shouldUseFreshDelivery,
} from "@/gateway/outbound/builders";
import { redactTrajectoryText } from "@/services/trajectory/event-journal";
import type { SessionRoute } from "@/types/gateway";
import type { GatewayDeliveryStatus } from "./outcome-types";
import type { GatewayReceiveDependencies } from "./types";

export interface GatewayReceiveDeliveryOutcome {
  status: GatewayDeliveryStatus;
  deliveryId?: string;
  failureNote?: string;
  outboxRecordId?: string;
}

export function sanitizeGatewayDeliveryFailure(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "The outbound adapter failed.";
  return redactTrajectoryText(raw).slice(0, 500);
}

export async function deliverGatewayReceiveResponse(
  deps: GatewayReceiveDependencies & {
    session: SessionRoute;
    response: string;
    traceId: string;
    progressiveDelivery?: { id: string };
    progressiveFailure?: { error: unknown; deliveryId?: string };
  },
): Promise<GatewayReceiveDeliveryOutcome> {
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
    if (deps.progressiveFailure) {
      const failureNote = sanitizeGatewayDeliveryFailure(
        deps.progressiveFailure.error,
      );
      const rejected = deps.recordOutbox(
        deps.message.platform,
        deps.traceId,
        deps.session.sessionKey,
        undefined,
        outbound,
        "rejected",
        [failureNote],
        deps.progressiveFailure.deliveryId,
      );
      deps.pushTrace({
        traceId: deps.traceId,
        at: at(),
        kind: "reject",
        platform: deps.message.platform,
        detail: failureNote,
        sessionId: deps.session.sessionKey,
        userId: deps.message.userId,
        roomId: deps.message.roomId,
        deliveryId: deps.progressiveFailure.deliveryId,
      });
      await deps.observeAdapter(deps.message.platform, {
        at: at(),
        kind: "reject",
        detail: failureNote,
      });
      return {
        status: "rejected",
        deliveryId: deps.progressiveFailure.deliveryId,
        failureNote,
        outboxRecordId: rejected?.recordId,
      };
    }
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
      return { status: "sent", deliveryId: delivery.id };
    } catch (error) {
      const detail = sanitizeGatewayDeliveryFailure(error);
      const rejected = deps.recordOutbox(
        deps.message.platform,
        deps.traceId,
        deps.session.sessionKey,
        undefined,
        outbound,
        "rejected",
        [detail],
        deps.progressiveDelivery?.id,
      );
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
      return {
        status: "rejected",
        deliveryId: deps.progressiveDelivery?.id,
        failureNote: detail,
        outboxRecordId: rejected?.recordId,
      };
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
  return { status: "fallback", deliveryId: delivery.id };
}
