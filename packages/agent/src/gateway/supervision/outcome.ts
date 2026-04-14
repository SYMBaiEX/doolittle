import type { PlatformName } from "@/types/gateway";
import {
  computeGatewayRestartBackoffMs,
  GATEWAY_DAEMON_POLICY,
  nextGatewayBackoffEligibility,
} from "../daemon-state";
import type {
  GatewaySupervisionAction,
  GatewaySupervisionDependencies,
  GatewaySupervisionPlatformState,
  GatewaySupervisionRecord,
} from "./types";

export type GatewaySupervisionOutcome = GatewaySupervisionAction | "healthy";

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
