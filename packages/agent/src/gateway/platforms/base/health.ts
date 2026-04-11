import type { PlatformHealth, TransportHealthInput } from "./types";

export function buildConfiguredTransportHealth(
  input: TransportHealthInput,
): PlatformHealth {
  const readyWhenRunning = input.readyWhenRunning ?? true;
  const ready =
    input.status === "running" && readyWhenRunning && input.configured;
  const detail = input.configured
    ? input.status === "running"
      ? input.runningDetail
      : (input.stoppedDetail ?? input.configuredDetail)
    : input.missingDetail;
  return {
    platform: input.platform,
    status: input.status,
    ready,
    mode: input.mode ?? "native",
    capabilities: input.capabilities,
    detail,
    startedAt: input.startedAt,
    stoppedAt: input.stoppedAt,
    lastSendAt: input.lastSendAt,
    lastDeliveryAt: input.lastDeliveryAt,
    lastDeliveryId: input.lastDeliveryId,
    lastOutboundRoomId: input.lastOutboundRoomId,
    lastOutboundUserId: input.lastOutboundUserId,
    lastOutboundThreadId: input.lastOutboundThreadId,
    lastOutboundReplyToId: input.lastOutboundReplyToId,
    lastOutboundMetadataKeys: input.lastOutboundMetadataKeys,
    lastWatchAt: input.lastWatchAt,
    lastWatchCount: input.lastWatchCount,
    lastWatchSummary: input.lastWatchSummary,
    sendCount: input.sendCount,
    lastError: input.lastError,
    events: input.events,
  };
}
