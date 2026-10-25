import type { PlatformPresenceState } from "../../platforms/base/index";
import { nowIso } from "../../platforms/base/index";
import { buildGatewayPlatformPresence } from "../../state/platform-state";
import type { GatewayPlatformStateView } from "../../state/state-snapshot/index";

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
