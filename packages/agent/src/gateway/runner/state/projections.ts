import type { PlatformPresenceState } from "@/gateway/platforms/base";
import { nowIso } from "@/gateway/platforms/base";
import { buildGatewayPlatformPresence } from "@/gateway/state/platform-state";
import type { GatewayPlatformStateView } from "@/gateway/state/state-snapshot";

export function buildGatewayRunnerPresence(
  status: PlatformPresenceState["status"],
  activity: string,
  lastHeartbeatAt?: string,
): PlatformPresenceState {
  return buildGatewayPlatformPresence(
    status,
    activity,
    nowIso,
    lastHeartbeatAt,
  );
}

export function deriveGatewayRunnerHeartbeatAt(
  platformStates: ReadonlyMap<string, GatewayPlatformStateView>,
): string | undefined {
  if (platformStates.size === 0) {
    return undefined;
  }

  return Array.from(platformStates.values())
    .map((state) => state.lastHeartbeatAt)
    .filter(Boolean)
    .at(-1);
}
