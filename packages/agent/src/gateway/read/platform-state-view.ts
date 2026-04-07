import type { PlatformName } from "@/types/gateway";
import type {
  PlatformHealth,
  PlatformLifecycleEvent,
  PlatformPresenceState,
} from "../platforms/base";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./history-view";

export interface GatewayPlatformStateView {
  platform: PlatformName;
  nativePluginId?: string;
  nativePluginSource?: "official" | "vendored" | "custom";
  nativePluginEnabled?: boolean;
  nativePluginNotes?: string;
  status: PlatformHealth["status"];
  mode: PlatformHealth["mode"];
  ready: boolean;
  transportState: "inactive" | "booting" | "live" | "degraded" | "paused";
  detail: string;
  presence: PlatformPresenceState;
  sendCount: number;
  receiveCount: number;
  routeCount: number;
  respondCount: number;
  heartbeatCount: number;
  authorizeCount: number;
  rejectCount: number;
  lastError?: string;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  lastOutboundAt?: string;
  lastReceivedAt?: string;
  lastInboundAt?: string;
  lastRoutedAt?: string;
  lastRespondedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastWatchdogReason?: string;
  lastWatchdogAction?: "healthy" | "restart" | "recover" | "backoff" | "skip";
  restartCount: number;
  restartFailureCount: number;
  lastRestartAt?: string;
  nextRestartAt?: string;
  lastSessionId?: string;
  lastRoomId?: string;
  lastUserId?: string;
  lastAttachmentAt?: string;
  lastAttachmentKind?: string;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  eventCount: number;
  lastEventAt?: string;
  lastEventKind?: PlatformLifecycleEvent["kind"];
  lastEventDetail?: string;
  traceCount: number;
  lastTraceAt?: string;
  lastTraceKind?: GatewayTraceRecord["kind"];
  lastTraceDetail?: string;
  lastUpdatedAt?: string;
}

export function createGatewayPlatformStateView(
  platform: PlatformName,
): GatewayPlatformStateView {
  return {
    platform,
    status: "stopped",
    mode: "mock",
    ready: false,
    transportState: "inactive",
    detail: `${platform} transport has not been initialized yet.`,
    presence: {
      status: "offline",
      activity: `${platform} transport idle`,
    },
    sendCount: 0,
    receiveCount: 0,
    routeCount: 0,
    respondCount: 0,
    heartbeatCount: 0,
    authorizeCount: 0,
    rejectCount: 0,
    restartCount: 0,
    restartFailureCount: 0,
    inboxCount: 0,
    outboxCount: 0,
    attachmentCount: 0,
    eventCount: 0,
    traceCount: 0,
  };
}

export function buildPlatformStateFromSnapshot(input: {
  platform: PlatformName;
  readiness: PlatformHealth;
  platformState: GatewayPlatformStateView;
  allTraces: readonly GatewayTraceRecord[];
  inbox: readonly GatewayInboxRecord[];
  outbox: readonly GatewayOutboxRecord[];
  attachments: readonly GatewayAttachmentRecord[];
  now: string;
}): GatewayPlatformStateView {
  const platformTraces = input.allTraces.filter(
    (trace) => trace.platform === input.platform,
  );
  const latestTrace = platformTraces.at(-1);
  const platformInbox = input.inbox.filter(
    (record) => record.platform === input.platform,
  );
  const platformOutbox = input.outbox.filter(
    (record) => record.platform === input.platform,
  );
  const platformAttachments = input.attachments.filter(
    (record) => record.platform === input.platform,
  );
  const latestInbox = platformInbox.at(-1);
  const latestOutbox = platformOutbox.at(-1);
  const latestAttachment = platformAttachments.at(-1);

  return {
    ...input.platformState,
    platform: input.platform,
    status: input.readiness.status,
    mode: input.readiness.mode,
    ready: input.readiness.ready,
    detail: input.readiness.detail,
    presence: input.readiness.presence ?? input.platformState.presence,
    lastError: input.platformState.lastError,
    sendCount: input.readiness.sendCount ?? 0,
    receiveCount: input.platformState.receiveCount,
    routeCount: input.platformState.routeCount,
    respondCount: input.platformState.respondCount,
    heartbeatCount: input.platformState.heartbeatCount,
    authorizeCount: input.platformState.authorizeCount,
    rejectCount: input.platformState.rejectCount,
    lastDeliveryAt: input.readiness.lastDeliveryAt,
    lastDeliveryId: input.readiness.lastDeliveryId,
    lastOutboundRoomId: input.readiness.lastOutboundRoomId,
    lastOutboundUserId: input.readiness.lastOutboundUserId,
    lastOutboundThreadId: input.readiness.lastOutboundThreadId,
    lastOutboundReplyToId: input.readiness.lastOutboundReplyToId,
    lastOutboundMetadataKeys: input.readiness.lastOutboundMetadataKeys,
    lastOutboundAt: latestOutbox?.at ?? input.platformState.lastOutboundAt,
    lastReceivedAt:
      input.readiness.lastReceivedAt ?? input.platformState.lastReceivedAt,
    lastInboundAt:
      latestInbox?.at ??
      input.platformState.lastInboundAt ??
      input.platformState.lastReceivedAt,
    lastRoutedAt:
      input.readiness.lastRoutedAt ?? input.platformState.lastRoutedAt,
    lastRespondedAt:
      input.readiness.lastRespondedAt ?? input.platformState.lastRespondedAt,
    lastHeartbeatAt:
      input.readiness.lastHeartbeatAt ?? input.platformState.lastHeartbeatAt,
    lastWatchdogAt: input.platformState.lastWatchdogAt,
    lastWatchdogReason: input.platformState.lastWatchdogReason,
    lastWatchdogAction: input.platformState.lastWatchdogAction,
    restartCount: input.platformState.restartCount,
    restartFailureCount: input.platformState.restartFailureCount,
    lastRestartAt: input.platformState.lastRestartAt,
    nextRestartAt: input.platformState.nextRestartAt,
    lastSessionId: input.platformState.lastSessionId,
    lastRoomId: input.platformState.lastRoomId,
    lastUserId: input.platformState.lastUserId,
    lastAttachmentAt:
      latestAttachment?.at ?? input.platformState.lastAttachmentAt,
    lastAttachmentKind:
      latestAttachment?.kind ?? input.platformState.lastAttachmentKind,
    inboxCount: platformInbox.length,
    outboxCount: platformOutbox.length,
    attachmentCount: platformAttachments.length,
    eventCount: input.readiness.events.length,
    lastEventAt: input.readiness.events[0]?.at,
    lastEventKind: input.readiness.events[0]?.kind,
    lastEventDetail: input.readiness.events[0]?.detail,
    traceCount: platformTraces.length,
    lastTraceAt: latestTrace?.at,
    lastTraceKind: latestTrace?.kind,
    lastTraceDetail: latestTrace?.detail,
    lastUpdatedAt: input.platformState.lastUpdatedAt ?? input.now,
  };
}
