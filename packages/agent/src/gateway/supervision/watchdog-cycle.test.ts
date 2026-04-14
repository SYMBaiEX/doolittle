import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import {
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonState,
  type GatewayRestartState,
} from "../daemon-state";
import type { PlatformAdapter, PlatformHealth } from "../platforms/base";
import { capabilitiesForPlatform } from "../platforms/base";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionPlatformState,
  GatewaySupervisionRecord,
} from "./index";
import {
  runGatewayRestart,
  runGatewayWatch,
  runGatewayWatchdog,
} from "./index";
import { applySupervisionOutcome } from "./outcome";
import { runGatewayWatchdogPlatform } from "./watchdog-cycle";

function makeHealth(
  platform: PlatformName,
  status: PlatformHealth["status"],
  ready: boolean,
  detail: string,
): PlatformHealth {
  return {
    platform,
    status,
    ready,
    mode: "native",
    capabilities: capabilitiesForPlatform(platform),
    detail,
    events: [],
  };
}

type TraceEvent = {
  traceId: string;
  at: string;
  kind: string;
  platform: string;
  detail: string;
};

type ObserveCall = {
  platform: PlatformName;
  event: {
    at: string;
    kind: string;
    detail: string;
  };
};

function createHarness() {
  const daemonState: GatewayDaemonState = {
    heartbeatRuns: 0,
    watchdogRuns: 0,
    restartRuns: 0,
    restartRecoveries: 0,
    restartBackoffs: 0,
    watchdogSkips: 0,
  };
  const restartStates = new Map<PlatformName, GatewayRestartState>();
  const platformStates = new Map<
    PlatformName,
    GatewaySupervisionPlatformState
  >();
  const records: GatewaySupervisionRecord[] = [];
  const snapshotReasons: Array<{ reason: string; limit?: number }> = [];
  const runtimeWrites: string[] = [];
  const traces: TraceEvent[] = [];
  const observeCalls: ObserveCall[] = [];
  const currentAt = "2026-03-29T12:00:00.000Z";
  let lastSupervisionAt: string | undefined;
  const adapterStats = {
    startCount: 0,
    stopCount: 0,
  };

  const getPlatformState = (
    platform: PlatformName,
  ): GatewaySupervisionPlatformState => {
    const existing = platformStates.get(platform);
    if (existing) {
      return existing;
    }
    const created: GatewaySupervisionPlatformState = {
      ready: false,
      status: "stopped",
      transportState: "inactive",
      restartCount: 0,
      restartFailureCount: 0,
    };
    platformStates.set(platform, created);
    return created;
  };

  const makeAdapter = (
    platform: PlatformName,
    health: PlatformHealth,
    options?: {
      watch?: PlatformAdapter["watch"];
      start?: () => Promise<void> | void;
      stop?: () => Promise<void> | void;
    },
  ): PlatformAdapter => ({
    name: platform,
    health: async () => health,
    send: async () => ({
      id: `${platform}-delivery`,
      target: {
        platform,
        channelId: `${platform}-channel`,
        userId: `${platform}-user`,
        mode: "origin",
      },
      text: "payload",
      threadId: `${platform}-thread`,
      replyToId: `${platform}-reply`,
      metadata: {},
      createdAt: currentAt,
    }),
    canReceive: () => true,
    observe: async () => undefined,
    start: async () => {
      adapterStats.startCount += 1;
      await options?.start?.();
    },
    stop: async () => {
      adapterStats.stopCount += 1;
      await options?.stop?.();
    },
    watch: options?.watch,
  });

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
    setLastSupervisionAt(at) {
      lastSupervisionAt = at;
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
    observeAdapter(platform, event) {
      observeCalls.push({ platform, event });
      return Promise.resolve();
    },
    pushTrace(entry) {
      traces.push({
        traceId: entry.traceId,
        at: entry.at,
        kind: entry.kind,
        platform: entry.platform,
        detail: entry.detail,
      });
    },
    writeRuntimeStatus() {
      runtimeWrites.push(currentAt);
    },
    snapshotState(reason, limit) {
      snapshotReasons.push({ reason, limit });
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
    snapshotReasons,
    runtimeWrites,
    traces,
    observeCalls,
    adapterStats,
    makeAdapter,
    getPlatformState,
    getLastSupervisionAt: () => lastSupervisionAt,
    ensureRestartState: deps.ensureRestartState,
    restartStates,
  };
}

describe("gateway supervision watchdog cycle", () => {
  it("records healthy outcomes for home assistant with watch cycle details", async () => {
    const harness = createHarness();
    const watchSummary = {
      watchedAt: "2026-03-29T12:00:20.000Z",
      count: 3,
      summary: "homeassistant watch summary",
    };
    harness.deps.adapters = new Map([
      [
        "homeassistant",
        harness.makeAdapter(
          "homeassistant",
          makeHealth("homeassistant", "running", true, "ready"),
          {
            watch: async () => watchSummary,
          },
        ),
      ],
    ]);

    const records = await runGatewayWatchdog(harness.deps, "watchdog");

    expect(records).toHaveLength(3);
    expect(records[0]?.action).toBe("health");
    expect(records[1]?.action).toBe("watch");
    expect(records[2]?.action).toBe("watch");
    expect(records[1]?.detail).toBe(
      "Home Assistant watch cycle observed 3 states during watchdog.",
    );
    expect(harness.observeCalls).toHaveLength(1);
    expect(harness.observeCalls[0]).toMatchObject({
      platform: "homeassistant",
      event: {
        kind: "heartbeat",
        detail: "homeassistant watch summary",
      },
    });
    expect(harness.daemonState.watchdogRuns).toBe(1);
    expect(harness.daemonState.lastReason).toBe("watchdog");
    expect(harness.getLastSupervisionAt()).toBe("2026-03-29T12:00:00.000Z");
    expect(harness.snapshotReasons).toEqual([
      { reason: "watchdog:watchdog", limit: 20 },
    ]);
    expect(harness.traces).toHaveLength(0);
  });

  it("records a backoff outcome when the restart window is still closed", async () => {
    const harness = createHarness();
    const health = makeHealth("api", "running", false, "api degraded");
    harness.deps.adapters = new Map([
      ["api", harness.makeAdapter("api", health)],
    ]);
    const restartState = harness.ensureRestartState("api");
    restartState.nextEligibleAt = new Date(Date.now() + 120_000).toISOString();
    restartState.backoffMs = 12_500;

    const records = await runGatewayWatchdog(harness.deps, "manual");

    expect(records).toHaveLength(1);
    expect(records[0]?.action).toBe("backoff");
    expect(records[0]?.detail).toContain("restart delayed");
    expect(records[0]?.delayMs).toBe(12_500);
    expect(harness.daemonState.restartBackoffs).toBe(1);
    expect(harness.runtimeWrites).toHaveLength(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "watchdog:manual", limit: 20 },
    ]);
    expect(harness.records).toHaveLength(1);
    expect(harness.records[0]?.action).toBe("backoff");
  });

  it("records skip when runGatewayWatch is invoked for an inactive adapter", async () => {
    const harness = createHarness();
    const records = await runGatewayWatch(harness.deps, "api", "manual-watch");

    expect(records).toEqual([
      expect.objectContaining({
        platform: "api",
        action: "skip",
        detail: "api watch skipped during manual-watch; adapter is not active.",
      }),
    ]);
    expect(harness.runtimeWrites).toHaveLength(0);
  });

  it("records skip when runGatewayWatch is invoked for non-watch-capable adapter", async () => {
    const harness = createHarness();
    harness.deps.adapters = new Map([
      [
        "api",
        harness.makeAdapter("api", makeHealth("api", "running", true, "ready")),
      ],
    ]);

    const records = await runGatewayWatch(harness.deps, "api", "manual-watch");

    expect(records).toEqual([
      expect.objectContaining({
        platform: "api",
        action: "skip",
        detail:
          "api watch skipped during manual-watch; adapter does not support watch cycles.",
      }),
    ]);
    expect(harness.runtimeWrites).toHaveLength(0);
  });

  it("records watch records and trace when adapter watch returns a watch result", async () => {
    const harness = createHarness();
    harness.deps.adapters = new Map([
      [
        "api",
        harness.makeAdapter(
          "api",
          makeHealth("api", "running", true, "ready"),
          {
            watch: async () => ({
              watchedAt: "2026-03-29T12:00:10.000Z",
              count: 2,
              summary: "watcher result summary",
            }),
          },
        ),
      ],
    ]);

    const records = await runGatewayWatch(harness.deps, "api", "manual-watch");

    expect(records).toEqual([
      {
        at: "2026-03-29T12:00:00.000Z",
        platform: "api",
        action: "watch",
        detail: "api watch cycle observed 2 states during manual-watch.",
      },
    ]);
    expect(harness.observeCalls).toHaveLength(1);
    expect(harness.observeCalls[0]).toMatchObject({
      platform: "api",
      event: {
        kind: "heartbeat",
        detail: "api watch cycle observed 2 states during manual-watch.",
      },
    });
    expect(harness.traces).toHaveLength(1);
    expect(harness.traces[0]).toMatchObject({
      at: "2026-03-29T12:00:10.000Z",
      kind: "heartbeat",
      platform: "api",
      detail: "watcher result summary",
    });
    expect(harness.runtimeWrites).toHaveLength(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "watch:api:manual-watch", limit: 20 },
    ]);
  });

  it("records skip for runGatewayRestart when adapter is missing", async () => {
    const harness = createHarness();
    const records = await runGatewayRestart(harness.deps, "api", "manual");

    expect(records).toEqual([
      expect.objectContaining({
        platform: "api",
        action: "skip",
        detail: "api restart skipped during manual; adapter is not active.",
      }),
    ]);
    expect(harness.adapterStats.startCount).toBe(0);
    expect(harness.adapterStats.stopCount).toBe(0);
  });

  it("records successful restart and counter increments for runGatewayRestart", async () => {
    const harness = createHarness();
    harness.deps.adapters = new Map([
      [
        "api",
        harness.makeAdapter(
          "api",
          makeHealth("api", "running", false, "degraded"),
          {
            stop: async () => undefined,
            start: async () => undefined,
          },
        ),
      ],
    ]);

    const platformState = harness.getPlatformState("api");
    const restartState = harness.ensureRestartState("api");
    restartState.failures = 2;

    const records = await runGatewayRestart(harness.deps, "api", "manual");

    expect(records).toHaveLength(1);
    expect(records[0]?.action).toBe("restart");
    expect(harness.daemonState.restartRuns).toBe(0);
    expect(platformState.restartCount).toBe(0);
    expect(restartState.failures).toBe(0);
    expect(harness.adapterStats.stopCount).toBe(1);
    expect(harness.adapterStats.startCount).toBe(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "restart:api:manual", limit: 20 },
    ]);
  });

  it("records recover when runGatewayRestart hits an exception and keeps failure count", async () => {
    const harness = createHarness();
    harness.deps.adapters = new Map([
      [
        "api",
        harness.makeAdapter(
          "api",
          makeHealth("api", "running", false, "degraded"),
          {
            stop: async () => undefined,
            start: async () => {
              throw new Error("boom");
            },
          },
        ),
      ],
    ]);

    const restartState = harness.ensureRestartState("api");
    restartState.failures = 0;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;

    const records = await runGatewayRestart(harness.deps, "api", "manual");

    expect(records).toHaveLength(1);
    expect(records[0]?.action).toBe("recover");
    expect(records[0]?.detail).toContain(
      "api restart failed during manual: boom",
    );
    expect(harness.daemonState.restartRecoveries).toBe(1);
    expect(harness.daemonState.restartRuns).toBe(0);
    expect(restartState.failures).toBe(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "restart-failed:api:manual", limit: 20 },
    ]);
  });

  it("records recover and resets state for non-restartable platforms", async () => {
    const harness = createHarness();
    const platform = "api";
    const platformState = harness.getPlatformState(platform);
    harness.deps.adapters = new Map([
      [
        platform,
        harness.makeAdapter(
          platform,
          makeHealth(platform, "stopped", false, "offline"),
        ),
      ],
    ]);
    platformState.ready = false;

    const adapter = harness.deps.adapters.get(platform);
    if (!adapter) {
      throw new Error("missing adapter");
    }
    const records = await runGatewayWatchdogPlatform({
      deps: harness.deps,
      platform,
      adapter,
      reason: "watchdog",
      watchdogAt: "2026-03-29T12:00:01.000Z",
    });

    expect(records).toEqual([
      expect.objectContaining({
        at: "2026-03-29T12:00:00.000Z",
        platform,
        action: "skip",
        detail: `${platform} supervision skipped during watchdog; adapter status stopped.`,
      }),
    ]);
    expect(harness.daemonState.watchdogSkips).toBe(1);
    expect(platformState.lastWatchdogAction).toBe("skip");
  });

  it("records backoff when restart window is active for watchdog platform", async () => {
    const harness = createHarness();
    const platform = "api";
    const health = makeHealth(platform, "running", false, "degraded");
    const restartState = harness.ensureRestartState(platform);
    restartState.nextEligibleAt = new Date(Date.now() + 120_000).toISOString();
    restartState.backoffMs = 12_500;
    harness.deps.adapters = new Map([
      [platform, harness.makeAdapter(platform, health)],
    ]);

    const adapter = harness.deps.adapters.get(platform);
    if (!adapter) {
      throw new Error("missing adapter");
    }
    const records = await runGatewayWatchdogPlatform({
      deps: harness.deps,
      platform,
      adapter,
      reason: "watchdog",
      watchdogAt: "2026-03-29T12:00:01.000Z",
    });

    expect(records).toEqual([
      expect.objectContaining({
        platform,
        action: "backoff",
      }),
    ]);
    expect(harness.daemonState.restartBackoffs).toBe(1);
    expect(restartState.failures).toBe(0);
  });

  it("records healthy outcome as reset and transport state when platform becomes healthy", () => {
    const harness = createHarness();
    const platform = "api";
    const state = harness.getPlatformState(platform);
    state.ready = true;
    state.transportState = "paused";
    const restartState = harness.ensureRestartState(platform);
    restartState.failures = 3;
    restartState.nextEligibleAt = "2026-03-29T12:00:30.000Z";
    restartState.backoffMs = 12_500;

    const record = applySupervisionOutcome(
      harness.deps,
      platform,
      "health",
      "api health restored",
    );

    expect(record).toMatchObject({
      at: "2026-03-29T12:00:00.000Z",
      platform,
      action: "health",
      detail: "api health restored",
    });
    expect(state.transportState).toBe("paused");
    expect(state.lastWatchdogAction).toBe("healthy");
    expect(state.restartFailureCount).toBe(0);
    expect(state.nextRestartAt).toBeUndefined();
    expect(restartState.failures).toBe(0);
    expect(restartState.nextEligibleAt).toBeUndefined();
    expect(restartState.backoffMs).toBe(
      GATEWAY_DAEMON_POLICY.restartBaseDelayMs,
    );
    expect(restartState.lastAction).toBe("healthy");
  });
});
