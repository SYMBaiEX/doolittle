import type { PlatformName } from "@/types/gateway";
import type {
  PlatformHealth,
  PlatformLifecycleEvent,
  PlatformPresenceState,
} from "../platforms/base";
import { isLightweightWebhookPlatform } from "../read/status-readiness";
import type { GatewayTraceStateContext } from "./trace-state";

export type GatewayTransportState =
  | "inactive"
  | "booting"
  | "live"
  | "degraded"
  | "paused";

export interface GatewayNativePluginInfo {
  id?: string;
  source?: "official" | "vendored" | "custom";
  enabled?: boolean;
  notes?: string;
}

export interface GatewayPlatformStateContext extends GatewayTraceStateContext {
  platform: PlatformName;
  nativePluginId?: string;
  nativePluginSource?: "official" | "vendored" | "custom";
  nativePluginEnabled?: boolean;
  nativePluginNotes?: string;
  mode: PlatformHealth["mode"];
  detail: string;
  sendCount: number;
  lastError?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  lastWatchdogAt?: string;
  lastWatchdogReason?: string;
  lastWatchdogAction?: "healthy" | "restart" | "recover" | "backoff" | "skip";
  restartCount: number;
  restartFailureCount: number;
  lastRestartAt?: string;
  nextRestartAt?: string;
  lastAttachmentAt?: string;
  lastAttachmentKind?: string;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  eventCount: number;
  lastEventAt?: string;
  lastEventKind?: PlatformLifecycleEvent["kind"];
  lastEventDetail?: string;
}

interface ApplyGatewayHealthToPlatformStateArgs {
  state: GatewayPlatformStateContext;
  health: PlatformHealth;
  nowIso: () => string;
  nativePlugin?: GatewayNativePluginInfo;
}

export function buildGatewayPlatformPresence(
  status: PlatformPresenceState["status"],
  activity: string,
  nowIso: () => string,
  lastHeartbeatAt?: string,
): PlatformPresenceState {
  return {
    status,
    activity,
    lastHeartbeatAt,
    lastPresenceChangeAt: nowIso(),
  };
}

export function createGatewayPlatformState(
  platform: PlatformName,
  nativePlugin?: GatewayNativePluginInfo,
): GatewayPlatformStateContext {
  return {
    platform,
    nativePluginId: nativePlugin?.id,
    nativePluginSource: nativePlugin?.source,
    nativePluginEnabled: nativePlugin?.enabled,
    nativePluginNotes: nativePlugin?.notes,
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
    lastReceivedAt: undefined,
    lastInboundAt: undefined,
    lastOutboundAt: undefined,
    lastRoutedAt: undefined,
    lastRespondedAt: undefined,
    lastHeartbeatAt: undefined,
    lastWatchdogAt: undefined,
    lastWatchdogReason: undefined,
    lastWatchdogAction: undefined,
    restartCount: 0,
    restartFailureCount: 0,
    lastRestartAt: undefined,
    nextRestartAt: undefined,
    lastSessionId: undefined,
    lastRoomId: undefined,
    lastUserId: undefined,
    lastAttachmentAt: undefined,
    lastAttachmentKind: undefined,
    inboxCount: 0,
    outboxCount: 0,
    attachmentCount: 0,
    eventCount: 0,
    traceCount: 0,
  };
}

export function computeGatewayTransportState(
  platform: PlatformName,
  status: PlatformHealth["status"],
  ready: boolean,
): GatewayTransportState {
  if (status === "running" && ready) {
    return "live";
  }
  if (status === "running") {
    return "degraded";
  }
  if (status === "idle") {
    return isLightweightWebhookPlatform(platform) ? "booting" : "inactive";
  }
  return ready ? "paused" : "inactive";
}

export function applyGatewayHealthToPlatformState(
  args: ApplyGatewayHealthToPlatformStateArgs,
): void {
  const { state, health, nativePlugin, nowIso } = args;
  state.nativePluginId = nativePlugin?.id;
  state.nativePluginSource = nativePlugin?.source;
  state.nativePluginEnabled = nativePlugin?.enabled;
  state.nativePluginNotes = nativePlugin?.notes;
  state.status = health.status;
  state.mode = health.mode;
  state.ready = health.ready;
  state.transportState = computeGatewayTransportState(
    health.platform,
    health.status,
    health.ready,
  );
  state.detail = health.detail;
  state.sendCount = health.sendCount ?? state.sendCount;
  state.lastDeliveryAt = health.lastDeliveryAt ?? state.lastDeliveryAt;
  state.lastDeliveryId = health.lastDeliveryId ?? state.lastDeliveryId;
  state.lastOutboundRoomId =
    health.lastOutboundRoomId ?? state.lastOutboundRoomId;
  state.lastOutboundUserId =
    health.lastOutboundUserId ?? state.lastOutboundUserId;
  state.lastOutboundThreadId =
    health.lastOutboundThreadId ?? state.lastOutboundThreadId;
  state.lastOutboundReplyToId =
    health.lastOutboundReplyToId ?? state.lastOutboundReplyToId;
  state.lastOutboundMetadataKeys =
    health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys;
  state.lastReceivedAt = health.lastReceivedAt ?? state.lastReceivedAt;
  state.lastRoutedAt = health.lastRoutedAt ?? state.lastRoutedAt;
  state.lastRespondedAt = health.lastRespondedAt ?? state.lastRespondedAt;
  state.lastHeartbeatAt = health.lastHeartbeatAt ?? state.lastHeartbeatAt;
  state.lastError = health.lastError;
  state.presence = health.presence ?? state.presence;
  state.eventCount = health.events.length;
  state.lastEventAt = health.events[0]?.at ?? state.lastEventAt;
  state.lastEventKind = health.events[0]?.kind ?? state.lastEventKind;
  state.lastEventDetail = health.events[0]?.detail ?? state.lastEventDetail;
  state.lastUpdatedAt = nowIso();
}
