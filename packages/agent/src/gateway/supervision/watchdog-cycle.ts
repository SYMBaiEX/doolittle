import type { PlatformName } from "@/types/gateway";
import {
  computeGatewayRestartBackoffMs,
  GATEWAY_DAEMON_POLICY,
  nextGatewayBackoffEligibility,
} from "../daemon-state";
import type { PlatformAdapter } from "../platforms/base";
import type {
  GatewaySupervisionAction,
  GatewaySupervisionDependencies,
  GatewaySupervisionPlatformState,
  GatewaySupervisionRecord,
} from "./index";

type GatewaySupervisionOutcome = GatewaySupervisionAction | "healthy";

function resetHealthyRestartState(
  state: GatewaySupervisionPlatformState,
  restartState: {
    failures: number;
    nextEligibleAt?: string;
    backoffMs: number;
    lastAction?: GatewaySupervisionAction | "healthy";
  },
): void {
  restartState.failures = 0;
  restartState.nextEligibleAt = undefined;
  restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
  restartState.lastAction = "healthy";
  state.restartFailureCount = 0;
  state.nextRestartAt = undefined;
  state.lastWatchdogAction = "healthy";
}

export function applySupervisionOutcome(
  deps: GatewaySupervisionDependencies,
  platform: PlatformName,
  outcome: GatewaySupervisionOutcome,
  detail: string,
  delayMs?: number,
): GatewaySupervisionRecord {
  const state = deps.getPlatformState(platform);
  const restartState = deps.ensureRestartState(platform);

  if (outcome === "restart") {
    deps.daemonState.restartRuns += 1;
    deps.daemonState.lastRestartAt = deps.nowIso();
    restartState.failures = 0;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
    restartState.nextEligibleAt = undefined;
    restartState.lastAction = "restart";
    state.restartCount += 1;
    state.restartFailureCount = restartState.failures;
    state.lastRestartAt = deps.daemonState.lastRestartAt;
    state.nextRestartAt = restartState.nextEligibleAt;
    state.lastWatchdogAt = deps.daemonState.lastWatchdogAt;
    state.lastWatchdogReason = deps.daemonState.lastReason;
    state.lastWatchdogAction = "restart";
    state.transportState = state.ready ? "live" : "degraded";
  } else if (outcome === "recover") {
    deps.daemonState.restartRecoveries += 1;
    deps.daemonState.lastRecoveryAt = deps.nowIso();
    restartState.failures += 1;
    restartState.backoffMs = computeGatewayRestartBackoffMs(
      GATEWAY_DAEMON_POLICY,
      restartState.failures,
    );
    restartState.nextEligibleAt = nextGatewayBackoffEligibility(
      GATEWAY_DAEMON_POLICY,
      restartState.failures,
    );
    restartState.lastAction = "recover";
    state.restartFailureCount = restartState.failures;
    state.nextRestartAt = restartState.nextEligibleAt;
    state.lastWatchdogAt = deps.daemonState.lastWatchdogAt;
    state.lastWatchdogReason = deps.daemonState.lastReason;
    state.lastWatchdogAction = "recover";
    state.transportState = state.ready ? "live" : "degraded";
  } else if (outcome === "backoff") {
    deps.daemonState.restartBackoffs += 1;
    deps.daemonState.lastBackoffAt = deps.nowIso();
    restartState.lastAction = "backoff";
    state.restartFailureCount = restartState.failures;
    state.lastWatchdogAt = deps.daemonState.lastWatchdogAt;
    state.lastWatchdogReason = deps.daemonState.lastReason;
    state.lastWatchdogAction = "backoff";
    state.nextRestartAt = restartState.nextEligibleAt;
  } else if (outcome === "skip") {
    deps.daemonState.watchdogSkips += 1;
    restartState.lastAction = "skip";
    state.lastWatchdogAt = deps.daemonState.lastWatchdogAt;
    state.lastWatchdogReason = deps.daemonState.lastReason;
    state.lastWatchdogAction = "skip";
  } else {
    resetHealthyRestartState(state, restartState);
    state.lastWatchdogAt = deps.daemonState.lastWatchdogAt;
    state.lastWatchdogReason = deps.daemonState.lastReason;
  }

  return deps.recordSupervision(
    platform,
    outcome === "healthy" ? "health" : outcome,
    detail,
    delayMs,
    restartState.failures,
  );
}

export async function runGatewayWatchdogPlatform(params: {
  deps: GatewaySupervisionDependencies;
  platform: PlatformName;
  adapter: PlatformAdapter;
  reason: string;
  watchdogAt: string;
}): Promise<GatewaySupervisionRecord[]> {
  const { deps, platform, adapter, reason, watchdogAt } = params;
  const health = await adapter.health();
  const restartState = deps.ensureRestartState(platform);
  const backoffActive =
    restartState.nextEligibleAt !== undefined &&
    new Date(restartState.nextEligibleAt).getTime() > Date.now();

  if (health.ready) {
    const records = [
      applySupervisionOutcome(
        deps,
        platform,
        "healthy",
        `${platform} healthy during ${reason}.`,
      ),
    ];

    if (platform === "homeassistant") {
      const watchResult = await adapter.watch?.(reason);
      if (watchResult) {
        records.push(
          deps.recordSupervision(
            platform,
            "watch",
            `Home Assistant watch cycle observed ${watchResult.count} states during ${reason}.`,
          ),
        );
        await deps.observeAdapter(platform, {
          at: watchResult.watchedAt,
          kind: "heartbeat",
          detail: watchResult.summary,
        });
      }
      records.push(
        deps.recordSupervision(
          platform,
          "watch",
          `Home Assistant watcher cycle acknowledged during ${reason}.`,
        ),
      );
    }

    return records;
  }

  const restartable = health.status === "running" || health.status === "idle";
  if (!restartable) {
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "skip",
        `${platform} supervision skipped during ${reason}; adapter status ${health.status}.`,
      ),
    ];
  }

  if (backoffActive) {
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "backoff",
        `${platform} restart delayed until ${restartState.nextEligibleAt} during ${reason}.`,
        restartState.backoffMs,
      ),
    ];
  }

  try {
    await adapter.stop();
    await adapter.start();
    restartState.failures = 0;
    restartState.nextEligibleAt = undefined;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
    restartState.lastRestartAt = watchdogAt;
    restartState.lastAction = "restart";
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "restart",
        `${platform} adapter restart attempted during ${reason}.`,
      ),
    ];
  } catch (error) {
    const detail = `${platform} recovery failed during ${reason}: ${error instanceof Error ? error.message : String(error)}`;
    return [applySupervisionOutcome(deps, platform, "recover", detail)];
  }
}
