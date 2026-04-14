import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "./types";
import { runGatewayWatchdogPlatform } from "./watchdog-cycle";

export async function runGatewayWatchdog(
  deps: GatewaySupervisionDependencies,
  reason = "watchdog",
): Promise<GatewaySupervisionRecord[]> {
  const records: GatewaySupervisionRecord[] = [];
  const watchdogAt = deps.nowIso();
  deps.setLastSupervisionAt(watchdogAt);
  deps.daemonState.watchdogRuns += 1;
  deps.daemonState.lastWatchdogAt = watchdogAt;
  deps.daemonState.lastReason = reason;

  for (const [platform, adapter] of deps.adapters.entries()) {
    records.push(
      ...(await runGatewayWatchdogPlatform({
        deps,
        platform,
        adapter,
        reason,
        watchdogAt,
      })),
    );
  }

  deps.writeRuntimeStatus();
  await deps.snapshotState(`watchdog:${reason}`, 20);
  return records;
}
