import type { PlatformHealth } from "@/gateway/platforms/base";
import type { GatewayPlatformStateView } from "../../state/state-snapshot";

export interface TransportActivityContext {
  platformState: GatewayPlatformStateView;
  readiness?: PlatformHealth;
  includeHealthMismatch?: boolean;
}

export function getTransportLastActivityAt(
  context: TransportActivityContext,
): string | undefined {
  return (
    context.platformState.lastUpdatedAt ??
    context.platformState.lastTraceAt ??
    context.platformState.lastEventAt ??
    (context.includeHealthMismatch
      ? context.readiness?.lastHeartbeatAt
      : undefined)
  );
}
