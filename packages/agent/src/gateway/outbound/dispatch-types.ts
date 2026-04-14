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

export interface GatewaySendToHomesOptions {
  metadata?: Record<string, string>;
  platforms?: PlatformName[];
  name?: string;
}

export interface GatewayEditDeliveryOptions {
  metadata?: Record<string, string>;
  threadId?: string;
  replyToId?: string;
}

export interface GatewayProgressiveDeliveryTarget {
  platform: PlatformName;
  roomId: string;
  userId?: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
}

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
    extras?: GatewayEditDeliveryOptions,
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
    options?: GatewayEditDeliveryOptions,
  ) => OutboundPlatformMessage;
  fallbackUpdate: (
    deliveryId: string,
    text: string,
    options?: GatewayEditDeliveryOptions,
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
    extras?: GatewayEditDeliveryOptions,
  ) => DeliveredMessageRecord;
  recordOutbox: GatewayOutboxWriter;
  pushTrace: GatewayOutboundTraceWriter;
  editDelivery: (
    deliveryId: string,
    text: string,
    options?: GatewayEditDeliveryOptions,
  ) => Promise<DeliveredMessageRecord>;
}
