import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import {
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonState,
  type GatewayRestartState,
} from "../daemon-state";
import { applySupervisionOutcome } from "./outcome";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionPlatformState,
  GatewaySupervisionRecord,
} from "./types";

function createHarness(platformReady = false) {
  const currentAt = "2026-03-29T12:00:00.000Z";
  const daemonState: GatewayDaemonState = {
    heartbeatRuns: 0,
    watchdogRuns: 0,
    restartRuns: 0,
    restartRecoveries: 0,
    restartBackoffs: 0,
    watchdogSkips: 0,
    lastWatchdogAt: "2026-03-29T11:59:00.000Z",
    lastReason: "watchdog",
  };
  const restartStates = new Map<PlatformName, GatewayRestartState>();
  const platformStates = new Map<
    PlatformName,
    GatewaySupervisionPlatformState
  >();
  const records: GatewaySupervisionRecord[] = [];

  const getPlatformState = (
    platform: PlatformName,
  ): GatewaySupervisionPlatformState => {
    const existing = platformStates.get(platform);
    if (existing) return existing;
    const created: GatewaySupervisionPlatformState = {
      ready: platformReady,
      status: "running",
      transportState: "inactive",
      restartCount: 0,
      restartFailureCount: 0,
    };
    platformStates.set(platform, created);
    return created;
  };

  const deps: GatewaySupervisionDependencies = {
    adapters: new Map(),
    daemonState,
    ensureRestartState(platform) {
      return ensureGatewayRestartState(
        restartStates,
        platform,
        GATEWAY_DAEMON_POLICY,
      );
    },
    getPlatformState,
    setLastSupervisionAt(_at) {
      return undefined;
    },
    recordSupervision(platform, action, detail, delayMs, attempt) {
      const record: GatewaySupervisionRecord = {
        at: currentAt,
        platform,
        action,
        detail,
        delayMs,
        attempt,
      };
      records.push(record);
      return record;
    },
    observeAdapter(_platform, _event) {
      return Promise.resolve();
    },
    writeRuntimeStatus() {},
    snapshotState(_reason, _limit) {
      return Promise.resolve({});
    },
    nowIso() {
      return currentAt;
    },
  };

  return {
    deps,
    daemonState,
    records,
    getPlatformState,
    ensureRestartState: deps.ensureRestartState,
  };
}

describe("applySupervisionOutcome", () => {
  it("restart: increments restartRuns, resets failures, bumps restartCount, sets transport to degraded when not ready", () => {
    const { deps, daemonState, getPlatformState, ensureRestartState } =
      createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);
    restartState.failures = 2;

    const record = applySupervisionOutcome(
      deps,
      platform,
      "restart",
      "api restarted",
    );

    expect(record).toMatchObject({
      platform,
      action: "restart",
      detail: "api restarted",
    });
    expect(daemonState.restartRuns).toBe(1);
    expect(daemonState.lastRestartAt).toBe("2026-03-29T12:00:00.000Z");
    expect(restartState.failures).toBe(0);
    expect(restartState.nextEligibleAt).toBeUndefined();
    expect(restartState.backoffMs).toBe(
      GATEWAY_DAEMON_POLICY.restartBaseDelayMs,
    );
    expect(restartState.lastAction).toBe("restart");
    const state = getPlatformState(platform);
    expect(state.restartCount).toBe(1);
    expect(state.restartFailureCount).toBe(0);
    expect(state.lastWatchdogAction).toBe("restart");
    expect(state.transportState).toBe("degraded");
  });

  it("restart: sets transport to live when platform is ready", () => {
    const { deps, getPlatformState } = createHarness(true);
    const platform: PlatformName = "api";

    applySupervisionOutcome(deps, platform, "restart", "api restarted");

    expect(getPlatformState(platform).transportState).toBe("live");
  });

  it("recover: increments restartRecoveries, increments failures, sets nextEligibleAt", () => {
    const { deps, daemonState, getPlatformState, ensureRestartState } =
      createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);
    restartState.failures = 0;

    const record = applySupervisionOutcome(
      deps,
      platform,
      "recover",
      "api recover detail",
    );

    expect(record).toMatchObject({
      platform,
      action: "recover",
      detail: "api recover detail",
    });
    expect(daemonState.restartRecoveries).toBe(1);
    expect(daemonState.lastRecoveryAt).toBe("2026-03-29T12:00:00.000Z");
    expect(restartState.failures).toBe(1);
    expect(restartState.nextEligibleAt).toBeDefined();
    expect(restartState.lastAction).toBe("recover");
    const state = getPlatformState(platform);
    expect(state.restartFailureCount).toBe(1);
    expect(state.nextRestartAt).toBeDefined();
    expect(state.lastWatchdogAction).toBe("recover");
    expect(state.transportState).toBe("degraded");
    // attempt field reflects current failure count
    expect(record.attempt).toBe(1);
  });

  it("recover: accumulates backoffMs with multiplier across multiple failures", () => {
    const { deps, ensureRestartState } = createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);
    restartState.failures = 2;

    applySupervisionOutcome(deps, platform, "recover", "detail");

    // failures went from 2 → 3, backoffMs should reflect that
    expect(restartState.failures).toBe(3);
    expect(restartState.backoffMs).toBeGreaterThan(
      GATEWAY_DAEMON_POLICY.restartBaseDelayMs,
    );
  });

  it("backoff: increments restartBackoffs, preserves failure count, sets lastWatchdogAction", () => {
    const { deps, daemonState, getPlatformState, ensureRestartState } =
      createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);
    restartState.failures = 3;
    restartState.nextEligibleAt = "2026-03-29T12:05:00.000Z";

    const record = applySupervisionOutcome(
      deps,
      platform,
      "backoff",
      "api backoff detail",
      12_500,
    );

    expect(record).toMatchObject({
      platform,
      action: "backoff",
      detail: "api backoff detail",
      delayMs: 12_500,
    });
    expect(daemonState.restartBackoffs).toBe(1);
    expect(daemonState.lastBackoffAt).toBe("2026-03-29T12:00:00.000Z");
    expect(restartState.failures).toBe(3);
    expect(restartState.lastAction).toBe("backoff");
    const state = getPlatformState(platform);
    expect(state.restartFailureCount).toBe(3);
    expect(state.nextRestartAt).toBe("2026-03-29T12:05:00.000Z");
    expect(state.lastWatchdogAction).toBe("backoff");
  });

  it("skip: increments watchdogSkips, sets lastWatchdogAction to skip", () => {
    const { deps, daemonState, getPlatformState, ensureRestartState } =
      createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);

    const record = applySupervisionOutcome(
      deps,
      platform,
      "skip",
      "api skipped",
    );

    expect(record).toMatchObject({
      platform,
      action: "skip",
      detail: "api skipped",
    });
    expect(daemonState.watchdogSkips).toBe(1);
    expect(restartState.lastAction).toBe("skip");
    const state = getPlatformState(platform);
    expect(state.lastWatchdogAction).toBe("skip");
  });

  it("healthy: resets all failure state and sets lastWatchdogAction to healthy", () => {
    const { deps, getPlatformState, ensureRestartState } = createHarness(false);
    const platform: PlatformName = "api";
    const restartState = ensureRestartState(platform);
    restartState.failures = 4;
    restartState.nextEligibleAt = "2026-03-29T12:10:00.000Z";
    restartState.backoffMs = 40_000;
    const state = getPlatformState(platform);
    state.restartFailureCount = 4;
    state.nextRestartAt = "2026-03-29T12:10:00.000Z";

    const record = applySupervisionOutcome(
      deps,
      platform,
      "healthy",
      "api healthy",
    );

    expect(record).toMatchObject({
      platform,
      action: "health",
      detail: "api healthy",
    });
    expect(restartState.failures).toBe(0);
    expect(restartState.nextEligibleAt).toBeUndefined();
    expect(restartState.backoffMs).toBe(
      GATEWAY_DAEMON_POLICY.restartBaseDelayMs,
    );
    expect(restartState.lastAction).toBe("healthy");
    expect(state.restartFailureCount).toBe(0);
    expect(state.nextRestartAt).toBeUndefined();
    expect(state.lastWatchdogAction).toBe("healthy");
    // attempt in the record should be 0 after reset
    expect(record.attempt).toBe(0);
  });

  it("propagates lastWatchdogAt and lastWatchdogReason from daemonState onto platform state", () => {
    const { deps, daemonState, getPlatformState } = createHarness(false);
    const platform: PlatformName = "api";
    daemonState.lastWatchdogAt = "2026-03-29T11:59:30.000Z";
    daemonState.lastReason = "scheduled";

    applySupervisionOutcome(deps, platform, "skip", "detail");

    const state = getPlatformState(platform);
    expect(state.lastWatchdogAt).toBe("2026-03-29T11:59:30.000Z");
    expect(state.lastWatchdogReason).toBe("scheduled");
  });
});
