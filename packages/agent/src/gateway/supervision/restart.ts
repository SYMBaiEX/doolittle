import type { PlatformName } from "@/types/gateway";
import {
  computeGatewayRestartBackoffMs,
  GATEWAY_DAEMON_POLICY,
} from "../daemon-state";
import { applySupervisionOutcome } from "./outcome";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "./types";

export async function runGatewayRestart(
  deps: GatewaySupervisionDependencies,
  platform: PlatformName | "all",
  reason = "manual",
): Promise<GatewaySupervisionRecord[]> {
  if (platform === "all") {
    const records: GatewaySupervisionRecord[] = [];
    for (const candidate of deps.adapters.keys()) {
      records.push(...(await runGatewayRestart(deps, candidate, reason)));
    }
    return records;
  }

  const adapter = deps.adapters.get(platform);
  if (!adapter) {
    return [
      deps.recordSupervision(
        platform,
        "skip",
        `${platform} restart skipped during ${reason}; adapter is not active.`,
      ),
    ];
  }

  const restartState = deps.ensureRestartState(platform);
  try {
    await adapter.stop();
    await adapter.start();
    restartState.failures = 0;
    restartState.nextEligibleAt = undefined;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
    restartState.lastRestartAt = deps.nowIso();
    restartState.lastAction = "restart";
    deps.writeRuntimeStatus();
    await deps.snapshotState(`restart:${platform}:${reason}`, 20);
    return [
      deps.recordSupervision(
        platform,
        "restart",
        `${platform} adapter restarted during ${reason}.`,
      ),
    ];
  } catch (error) {
    const detail = `${platform} restart failed during ${reason}: ${error instanceof Error ? error.message : String(error)}`;
    const delayMs = computeGatewayRestartBackoffMs(
      GATEWAY_DAEMON_POLICY,
      restartState.failures + 1,
    );
    deps.writeRuntimeStatus();
    await deps.snapshotState(`restart-failed:${platform}:${reason}`, 20);
    return [
      applySupervisionOutcome(deps, platform, "recover", detail, delayMs),
    ];
  }
}
