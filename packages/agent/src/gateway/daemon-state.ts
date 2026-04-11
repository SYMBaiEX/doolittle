import type { PlatformName } from "@/types/gateway";

export interface GatewayDaemonPolicy {
  heartbeatIntervalMs: number;
  watchdogIntervalMs: number;
  restartBaseDelayMs: number;
  restartMaxDelayMs: number;
  restartMultiplier: number;
  restartJitterMs: number;
}

export interface GatewayDaemonState {
  heartbeatRuns: number;
  watchdogRuns: number;
  restartRuns: number;
  restartRecoveries: number;
  restartBackoffs: number;
  watchdogSkips: number;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastRestartAt?: string;
  lastRecoveryAt?: string;
  lastBackoffAt?: string;
  lastReason?: string;
}

export interface GatewayRestartState {
  failures: number;
  lastRestartAt?: string;
  nextEligibleAt?: string;
  lastAction?: GatewayDaemonRuntimeState["restartQueue"][number]["action"];
  backoffMs: number;
}

export interface GatewayDaemonRuntimeState {
  policy: GatewayDaemonPolicy;
  state: GatewayDaemonState;
  restartQueue: Array<{
    platform: PlatformName;
    failures: number;
    lastRestartAt?: string;
    nextEligibleAt?: string;
    backoffMs: number;
    action?: "healthy" | "restart" | "recover" | "backoff" | "skip";
  }>;
  watchdog: {
    running: boolean;
    activePlatforms: number;
    unhealthyPlatforms: number;
    restartablePlatforms: number;
    backoffPlatforms: number;
    lastWatchdogAt?: string;
    lastReason?: string;
  };
}

export const GATEWAY_DAEMON_POLICY: GatewayDaemonPolicy = {
  heartbeatIntervalMs: 60_000,
  watchdogIntervalMs: 45_000,
  restartBaseDelayMs: 5_000,
  restartMaxDelayMs: 5 * 60_000,
  restartMultiplier: 2,
  restartJitterMs: 750,
};

export function createGatewayRestartState(
  policy: GatewayDaemonPolicy,
): GatewayRestartState {
  return {
    failures: 0,
    backoffMs: policy.restartBaseDelayMs,
  };
}

export function ensureGatewayRestartState(
  map: Map<PlatformName, GatewayRestartState>,
  platform: PlatformName,
  policy: GatewayDaemonPolicy,
): GatewayRestartState {
  const existing = map.get(platform);
  if (existing) {
    return existing;
  }
  const created = createGatewayRestartState(policy);
  map.set(platform, created);
  return created;
}

export function computeGatewayRestartBackoffMs(
  policy: GatewayDaemonPolicy,
  failures: number,
): number {
  const raw =
    policy.restartBaseDelayMs *
    Math.max(1, policy.restartMultiplier ** Math.max(0, failures - 1));
  const jitter = Math.min(policy.restartJitterMs, Math.max(0, raw / 8));
  return Math.min(policy.restartMaxDelayMs, Math.max(0, raw + jitter));
}

export function nextGatewayBackoffEligibility(
  policy: GatewayDaemonPolicy,
  failures: number,
  nowMs = Date.now(),
): string {
  const backoffMs = computeGatewayRestartBackoffMs(policy, failures);
  return new Date(nowMs + backoffMs).toISOString();
}

export function buildGatewayWatchdogSnapshot(options: {
  running: boolean;
  activePlatforms: number;
  unhealthyPlatforms: number;
  backoffPlatforms: number;
  lastWatchdogAt?: string;
  lastReason?: string;
}): GatewayDaemonRuntimeState["watchdog"] {
  return {
    running: options.running,
    activePlatforms: options.activePlatforms,
    unhealthyPlatforms: options.unhealthyPlatforms,
    restartablePlatforms: options.activePlatforms,
    backoffPlatforms: options.backoffPlatforms,
    lastWatchdogAt: options.lastWatchdogAt,
    lastReason: options.lastReason,
  };
}

export function buildGatewayDaemonRuntimeState(options: {
  policy: GatewayDaemonPolicy;
  state: GatewayDaemonState;
  restartBackoffByPlatform: Map<PlatformName, GatewayRestartState>;
  running: boolean;
  activePlatforms: number;
  unhealthyPlatforms: number;
  backoffPlatforms: number;
}): GatewayDaemonRuntimeState {
  return {
    policy: options.policy,
    state: { ...options.state },
    restartQueue: Array.from(options.restartBackoffByPlatform.entries()).map(
      ([platform, state]) => ({
        platform,
        failures: state.failures,
        lastRestartAt: state.lastRestartAt,
        nextEligibleAt: state.nextEligibleAt,
        backoffMs: state.backoffMs,
        action: state.lastAction,
      }),
    ),
    watchdog: buildGatewayWatchdogSnapshot({
      running: options.running,
      activePlatforms: options.activePlatforms,
      unhealthyPlatforms: options.unhealthyPlatforms,
      backoffPlatforms: options.backoffPlatforms,
      lastWatchdogAt: options.state.lastWatchdogAt,
      lastReason: options.state.lastReason,
    }),
  };
}
