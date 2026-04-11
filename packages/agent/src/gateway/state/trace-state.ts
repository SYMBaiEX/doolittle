import type { PlatformPresenceState } from "../platforms/base";
import type { GatewayTraceRecord } from "../read/history-view";

export interface GatewayTraceStateContext {
  status: "idle" | "running" | "stopped";
  ready: boolean;
  traceCount: number;
  lastTraceAt?: string;
  lastTraceKind?: GatewayTraceRecord["kind"];
  lastTraceDetail?: string;
  lastUpdatedAt?: string;
  lastRoomId?: string;
  lastUserId?: string;
  lastSessionId?: string;
  receiveCount: number;
  authorizeCount: number;
  routeCount: number;
  respondCount: number;
  heartbeatCount: number;
  rejectCount: number;
  lastReceivedAt?: string;
  lastInboundAt?: string;
  lastRoutedAt?: string;
  lastRespondedAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundAt?: string;
  lastHeartbeatAt?: string;
  transportState: "inactive" | "booting" | "live" | "degraded" | "paused";
  presence: PlatformPresenceState;
}

interface ApplyGatewayTraceToPlatformStateArgs {
  state: GatewayTraceStateContext;
  entry: GatewayTraceRecord;
  buildPresence: (
    status: PlatformPresenceState["status"],
    activity: string,
    lastHeartbeatAt?: string,
  ) => PlatformPresenceState;
}

export function applyGatewayTraceToPlatformState(
  args: ApplyGatewayTraceToPlatformStateArgs,
): void {
  const { state, entry, buildPresence } = args;
  if (entry.platform === "gateway") {
    return;
  }

  state.traceCount += 1;
  state.lastTraceAt = entry.at;
  state.lastTraceKind = entry.kind;
  state.lastTraceDetail = entry.detail;
  state.lastUpdatedAt = entry.at;
  state.lastRoomId = entry.roomId ?? state.lastRoomId;
  state.lastUserId = entry.userId ?? state.lastUserId;
  state.lastSessionId = entry.sessionId ?? state.lastSessionId;

  switch (entry.kind) {
    case "receive":
      state.receiveCount += 1;
      state.lastReceivedAt = entry.at;
      state.lastInboundAt = entry.at;
      state.transportState = state.ready ? "live" : "degraded";
      state.presence = buildPresence(
        "online",
        `Receiving traffic on ${entry.platform}`,
        entry.at,
      );
      break;
    case "authorize":
      state.authorizeCount += 1;
      state.presence = buildPresence(
        state.presence.status === "offline" ? "away" : state.presence.status,
        `Authorization in progress for ${entry.platform}`,
        state.lastHeartbeatAt,
      );
      break;
    case "session":
      state.presence = buildPresence(
        "online",
        `Session ${entry.sessionId ?? "unknown"} active on ${entry.platform}`,
        state.lastHeartbeatAt,
      );
      break;
    case "route":
      state.routeCount += 1;
      state.lastRoutedAt = entry.at;
      state.presence = buildPresence(
        "online",
        `Routing traffic for session ${entry.sessionId ?? "unknown"}`,
        state.lastHeartbeatAt,
      );
      break;
    case "respond":
      state.respondCount += 1;
      state.lastRespondedAt = entry.at;
      state.transportState = state.ready ? "live" : "degraded";
      state.presence = buildPresence(
        "online",
        `Responding through ${entry.platform}`,
        state.lastHeartbeatAt,
      );
      break;
    case "deliver":
      state.lastDeliveryAt = entry.at;
      state.lastDeliveryId = entry.deliveryId ?? state.lastDeliveryId;
      state.lastOutboundAt = entry.at;
      state.transportState = state.ready ? "live" : "degraded";
      break;
    case "update":
      state.lastDeliveryAt = entry.at;
      state.lastDeliveryId = entry.deliveryId ?? state.lastDeliveryId;
      state.lastOutboundAt = entry.at;
      state.transportState = state.ready ? "live" : "degraded";
      state.presence = buildPresence(
        "online",
        `Updating delivery on ${entry.platform}`,
        state.lastHeartbeatAt,
      );
      break;
    case "heartbeat":
      state.heartbeatCount += 1;
      state.lastHeartbeatAt = entry.at;
      state.transportState = state.ready ? "live" : state.transportState;
      state.presence = buildPresence(
        "online",
        `${entry.platform} heartbeat`,
        entry.at,
      );
      break;
    case "reject":
      state.rejectCount += 1;
      state.transportState = state.ready ? "degraded" : "paused";
      state.presence = buildPresence(
        "away",
        `${entry.platform} rejected or paused`,
        state.lastHeartbeatAt,
      );
      break;
    case "lifecycle":
      state.transportState =
        state.status === "running"
          ? state.ready
            ? "live"
            : "degraded"
          : "inactive";
      state.presence = buildPresence(
        state.status === "running" ? "online" : "offline",
        entry.detail,
        state.lastHeartbeatAt,
      );
      break;
    default:
      break;
  }
}
