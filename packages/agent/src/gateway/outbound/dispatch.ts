import { randomUUID } from "node:crypto";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformLifecycleEvent,
} from "../platforms/base";
import type {
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../read/history-view";

export type GatewayOutboundTraceWriter = (entry: GatewayTraceRecord) => void;

export type GatewayOutboxWriter = (
  platform: PlatformName,
  traceId: string,
  sessionId: string | undefined,
  delivery: DeliveredMessageRecord,
  message: OutboundPlatformMessage,
  status: GatewayOutboxRecord["status"],
) => void;

export type GatewayOutboxLifecycleWriter = (
  platform: PlatformName,
  event: PlatformLifecycleEvent,
) => Promise<void>;

export interface GatewaySendToHomesDependencies {
  listHomeSessions: (
    platforms: ReadonlySet<PlatformName> | null,
  ) => readonly SessionRoute[];
  buildOutboundForSession: (
    session: SessionRoute,
    outbound: OutboundPlatformMessage,
    speechName: string,
  ) => Promise<OutboundPlatformMessage>;
  getAdapter: (platform: PlatformName) => PlatformAdapter | undefined;
  fallbackDeliver: (
    target: {
      platform: PlatformName;
      channelId?: string;
      userId?: string;
      mode: "origin" | "home" | "explicit" | "local";
    },
    text: string,
    extras?: {
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
  ) => DeliveredMessageRecord;
  recordOutbox: GatewayOutboxWriter;
  pushTrace: GatewayOutboundTraceWriter;
}

export interface GatewayEditDeliveryDependencies {
  getDelivery: (deliveryId: string) => DeliveredMessageRecord | undefined;
  getOutboxSessionIdByDeliveryId: (deliveryId: string) => string | undefined;
  getAdapter: (platform: PlatformName) => PlatformAdapter | undefined;
  buildOutboundFromDelivery: (
    delivery: DeliveredMessageRecord,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => OutboundPlatformMessage;
  fallbackUpdate: (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => Promise<DeliveredMessageRecord>;
  recordOutbox: GatewayOutboxWriter;
  pushTrace: GatewayOutboundTraceWriter;
  observeAdapter: GatewayOutboxLifecycleWriter;
  snapshotState: (reason: string, limit?: number) => Promise<unknown>;
}

export interface GatewayProgressiveDeliveryDependencies {
  getAdapter: (platform: PlatformName) => PlatformAdapter | undefined;
  fallbackDeliver: (
    target: {
      platform: PlatformName;
      channelId?: string;
      userId?: string;
      mode: "origin" | "home" | "explicit" | "local";
    },
    text: string,
    extras?: {
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
  ) => DeliveredMessageRecord;
  recordOutbox: GatewayOutboxWriter;
  pushTrace: GatewayOutboundTraceWriter;
  editDelivery: (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => Promise<DeliveredMessageRecord>;
}

export async function sendToHomesOutbound(
  text: string,
  options:
    | {
        metadata?: Record<string, string>;
        platforms?: PlatformName[];
        name?: string;
      }
    | undefined,
  deps: GatewaySendToHomesDependencies,
): Promise<DeliveredMessageRecord[]> {
  const deliveries: DeliveredMessageRecord[] = [];
  const platforms = options?.platforms?.length
    ? new Set(options.platforms)
    : null;
  const homeSessions = deps.listHomeSessions(platforms);

  for (const session of homeSessions) {
    const traceId = randomUUID();
    const roomId = session.channelId ?? session.roomId;
    const outbound = await deps.buildOutboundForSession(
      session,
      {
        roomId,
        userId: session.userId,
        text,
        threadId: session.threadId,
        replyToId: session.replyToMessageId,
        metadata: options?.metadata,
      },
      options?.name ?? "home-delivery",
    );
    const adapter = deps.getAdapter(session.platform);
    const delivery = adapter
      ? await adapter.send(outbound)
      : deps.fallbackDeliver(
          {
            platform: session.platform,
            channelId: roomId,
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
    deps.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "deliver",
      platform: session.platform,
      detail: `Delivered to home channel ${roomId} with record ${delivery.id}.`,
      sessionId: session.sessionKey,
      userId: session.userId,
      roomId: session.channelId ?? session.roomId,
      threadId: outbound.threadId,
      replyToMessageId: outbound.replyToId,
      deliveryId: delivery.id,
      metadataKeys: Object.keys(delivery.metadata ?? {}),
    });
  }

  return deliveries;
}

export async function editDeliveryOutbound(
  deliveryId: string,
  text: string,
  options:
    | {
        metadata?: Record<string, string>;
        threadId?: string;
        replyToId?: string;
      }
    | undefined,
  deps: GatewayEditDeliveryDependencies,
): Promise<DeliveredMessageRecord> {
  const delivery = deps.getDelivery(deliveryId);
  if (!delivery) {
    throw new Error(`Delivery ${deliveryId} was not found.`);
  }

  const platform = delivery.target.platform;
  const traceId = randomUUID();
  const sessionId = deps.getOutboxSessionIdByDeliveryId(delivery.id);
  const message = deps.buildOutboundFromDelivery(delivery, text, {
    metadata: options?.metadata,
    threadId: options?.threadId,
    replyToId: options?.replyToId,
  });
  const adapter = deps.getAdapter(platform);
  const updated = adapter?.edit
    ? await adapter.edit(delivery, message)
    : await deps.fallbackUpdate(delivery.id, message.text, {
        threadId: message.threadId,
        replyToId: message.replyToId,
        metadata: {
          ...(delivery.metadata ?? {}),
          ...(message.metadata ?? {}),
          editedLocally: "true",
        },
      });

  deps.recordOutbox(platform, traceId, sessionId, updated, message, "edited");
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
  await deps.observeAdapter(platform, {
    at: new Date().toISOString(),
    kind: "edit",
    detail: `Updated delivery ${deliveryId} on ${platform}.`,
  });
  await deps.snapshotState("edit", 20);
  return updated;
}

export async function sendProgressiveOutbound(
  target: {
    platform: PlatformName;
    roomId: string;
    userId?: string;
    threadId?: string;
    replyToId?: string;
    metadata?: Record<string, string>;
  },
  parts: string[],
  deps: GatewayProgressiveDeliveryDependencies,
): Promise<DeliveredMessageRecord> {
  const [first, ...rest] = parts.map((part) => part.trim()).filter(Boolean);
  if (!first) {
    throw new Error("Progressive delivery requires at least one message part.");
  }

  const adapter = deps.getAdapter(target.platform);
  const traceId = randomUUID();
  const initialMessage: OutboundPlatformMessage = {
    roomId: target.roomId,
    userId: target.userId,
    text: first,
    threadId: target.threadId,
    replyToId: target.replyToId,
    metadata: {
      ...(target.metadata ?? {}),
      progressive: "true",
      progressiveStep: "1",
      progressiveTotal: String(rest.length + 1),
    },
  };
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

  for (const [index, part] of rest.entries()) {
    delivery = await deps.editDelivery(delivery.id, part, {
      threadId: target.threadId,
      replyToId: target.replyToId,
      metadata: {
        ...(target.metadata ?? {}),
        progressive: "true",
        progressiveStep: String(index + 2),
        progressiveTotal: String(rest.length + 1),
      },
    });
  }

  return delivery;
}
