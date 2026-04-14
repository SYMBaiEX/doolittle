import { describe, expect, it } from "bun:test";
import { createGatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import type {
  GatewayRunnerLifecycleHostInputs,
  GatewayRunnerSupervisionHostInputs,
} from "@/gateway/runner/host";
import type { GatewayRunnerLifecycleHost } from "@/gateway/runner/lifecycle/types";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "@/gateway/supervision/index";

const fakeHistorySnapshot = {
  reason: "manual",
  updatedAt: "2026-04-01T00:00:00.000Z",
} as GatewayHistorySnapshot;

const fakeState = {
  running: false,
  reason: "heartbeat",
  updatedAt: "2026-04-01T00:00:00.000Z",
  snapshotPath: "/tmp/snapshot.json",
  historyPath: "/tmp/snapshot-history.jsonl",
  daemon: {
    policy: {
      heartbeatIntervalMs: 10_000,
      watchdogIntervalMs: 10_000,
      restartBaseDelayMs: 5_000,
      restartMaxDelayMs: 60_000,
      restartMultiplier: 2,
      restartJitterMs: 250,
    },
    state: {
      heartbeatRuns: 0,
      watchdogRuns: 0,
      restartRuns: 0,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
    },
    restartQueue: [],
    watchdog: {
      running: false,
      activePlatforms: 0,
      unhealthyPlatforms: 0,
      restartablePlatforms: 0,
      backoffPlatforms: 0,
    },
  },
  totals: {
    configuredPlatforms: 0,
    activeAdapters: 0,
    readyAdapters: 0,
    gatewayEnabledTransports: 0,
    operationalTransports: 0,
    nativeAdapters: 0,
    mockAdapters: 0,
    pluginMediatedAdapters: 0,
    officialPluginAdapters: 0,
    vendoredPluginAdapters: 0,
    totalTraces: 0,
    recentTraces: 0,
    inboxMessages: 0,
    outboxMessages: 0,
    attachmentRecords: 0,
    recentDeliveries: 0,
    recentSessions: 0,
  },
  platforms: [],
  transportOverview: {
    mismatchCount: 0,
    operationalCount: 0,
    details: [],
  },
  transportSummaries: [],
  transportJournal: [],
  tracesByKind: [],
  tracesByPlatform: [],
  inboxByPlatform: [],
  outboxByPlatform: [],
  attachmentsByPlatform: [],
  attachmentsByKind: [],
  deliveriesByPlatform: [],
  sessionsByPlatform: [],
} as GatewayStateSnapshot;

function makeLifecycleInputs(): GatewayRunnerLifecycleHostInputs {
  return {
    context: {
      config: {} as never,
      services: { hooks: { emit: async () => {} } } as never,
      runtime: {} as never,
    } as never,
    adapters: new Map(),
    daemonState: {
      heartbeatRuns: 0,
      watchdogRuns: 0,
      restartRuns: 0,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
    },
    getRunning: () => false,
    setRunning: () => {},
    getStartedAt: () => undefined,
    setStartedAt: () => {},
    getStoppedAt: () => undefined,
    setStoppedAt: () => {},
    getLastHeartbeatAt: () => undefined,
    setLastHeartbeatAt: () => {},
    getHeartbeatInterval: () => null,
    setHeartbeatInterval: () => {},
    getSupervisionInterval: () => null,
    setSupervisionInterval: () => {},
    createAdapter: () => {
      throw new Error("should not be called");
    },
    ensureRestartState: () => {},
    syncPlatformStateFromHealth: () => {},
    pushTrace: () => {},
    observeAdapter: async () => {},
    writeRuntimeStatus: () => {},
    snapshotState: async () => fakeHistorySnapshot,
    runHeartbeat: async () => fakeState,
    runWatchdog: async () => [],
  };
}

function makeSupervisionInputs(): GatewayRunnerSupervisionHostInputs {
  return {
    adapters: new Map(),
    daemonState: {
      heartbeatRuns: 0,
      watchdogRuns: 0,
      restartRuns: 0,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
    },
    stateBookkeeping: {
      ensureRestartState: () => ({ failures: 0 }) as never,
      ensurePlatformState: () => ({}) as never,
    },
    recording: {
      recordSupervision: (
        platform,
        action,
        detail,
        delayMs,
        attempt,
      ): GatewaySupervisionRecord =>
        ({
          at: "2026-04-01T00:00:00.000Z",
          platform,
          action,
          detail,
          delayMs,
          attempt,
        }) as GatewaySupervisionRecord,
      pushTrace: () => {},
    },
    setLastSupervisionAt: () => {},
    observeAdapter: async () => {},
    writeRuntimeStatus: () => {},
    snapshotState: async () => fakeHistorySnapshot,
  };
}

function makeSupervisionDeps(): GatewaySupervisionDependencies {
  return {
    adapters: new Map(),
    daemonState: {
      heartbeatRuns: 0,
      watchdogRuns: 0,
      restartRuns: 0,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
    },
    ensureRestartState: () => ({}) as never,
    getPlatformState: () => ({}) as never,
    setLastSupervisionAt: () => {},
    recordSupervision: () =>
      ({
        at: "2026-04-01T00:00:00.000Z",
        platform: "api",
        action: "health",
        detail: "ok",
      }) as GatewaySupervisionRecord,
    observeAdapter: async () => {},
    pushTrace: () => {},
    writeRuntimeStatus: () => {},
    snapshotState: async () => fakeHistorySnapshot,
    nowIso: () => "2026-04-01T00:00:00.000Z",
  };
}

describe("gateway runner control-plane", () => {
  it("delegates lifecycle calls through control plane hooks", async () => {
    let hostBuilds = 0;
    let starts = 0;
    let stops = 0;
    let heartbeats = 0;

    const lifecycleHost: GatewayRunnerLifecycleHost = {
      ...makeLifecycleInputs(),
      context: {
        config: {},
        services: { hooks: { emit: async () => {} } },
        runtime: {},
      } as never,
      adapters: new Map(),
      daemonState: {
        heartbeatRuns: 0,
        watchdogRuns: 0,
        restartRuns: 0,
        restartRecoveries: 0,
        restartBackoffs: 0,
        watchdogSkips: 0,
      },
      get running() {
        return false;
      },
      set running(_) {},
      get startedAt() {
        return undefined;
      },
      set startedAt(_) {},
      get stoppedAt() {
        return undefined;
      },
      set stoppedAt(_) {},
      get lastHeartbeatAt() {
        return undefined;
      },
      set lastHeartbeatAt(_) {},
      get heartbeatInterval() {
        return null;
      },
      set heartbeatInterval(_) {},
      get supervisionInterval() {
        return null;
      },
      set supervisionInterval(_) {},
      createAdapter: () => {
        throw new Error("should not be called");
      },
      ensureRestartState: () => {},
      syncPlatformStateFromHealth: () => {},
      pushTrace: () => {},
      observeAdapter: async () => {},
      writeRuntimeStatus: () => {},
      snapshotState: async () => fakeHistorySnapshot,
      runHeartbeat: async () => fakeState,
      runWatchdog: async () => [],
    };

    const controlPlane = createGatewayRunnerControlPlane({
      lifecycle: makeLifecycleInputs(),
      supervision: makeSupervisionInputs(),
      buildLifecycleHost: () => {
        hostBuilds += 1;
        return lifecycleHost;
      },
      runLifecycleStart: async () => {
        starts += 1;
      },
      runLifecycleStop: async () => {
        stops += 1;
      },
      runHeartbeat: async () => {
        heartbeats += 1;
        return fakeState;
      },
    });

    await controlPlane.start();
    expect(await controlPlane.heartbeat("manual")).toBe(fakeState);
    await controlPlane.stop();

    expect(starts).toBe(1);
    expect(stops).toBe(1);
    expect(heartbeats).toBe(1);
    expect(hostBuilds).toBe(3);
  });

  it("delegates supervision calls with platform and reason", async () => {
    let depBuilds = 0;
    let watchdogRuns = 0;
    let watchRuns = 0;
    let restartRuns = 0;

    const controlPlane = createGatewayRunnerControlPlane({
      lifecycle: makeLifecycleInputs(),
      supervision: makeSupervisionInputs(),
      buildSupervisionDeps: () => {
        depBuilds += 1;
        return makeSupervisionDeps();
      },
      runWatchdog: async () => {
        watchdogRuns += 1;
        return [
          {
            at: "2026-04-01T00:00:00.000Z",
            platform: "api",
            action: "watch",
            detail: "watchdog",
          } as GatewaySupervisionRecord,
        ];
      },
      runWatch: async () => {
        watchRuns += 1;
        return [
          {
            at: "2026-04-01T00:00:00.000Z",
            platform: "api",
            action: "watch",
            detail: "watch",
          } as GatewaySupervisionRecord,
        ];
      },
      runRestart: async () => {
        restartRuns += 1;
        return [
          {
            at: "2026-04-01T00:00:00.000Z",
            platform: "api",
            action: "restart",
            detail: "restart",
          } as GatewaySupervisionRecord,
        ];
      },
    });

    const manual = await controlPlane.supervise("manual");
    const watchdog = await controlPlane.watchdog("watchdog");
    const watch = await controlPlane.watch("api", "manual-watch");
    const restart = await controlPlane.restart("api", "manual");

    expect(manual).toHaveLength(1);
    expect(watchdog).toHaveLength(1);
    expect(watch).toHaveLength(1);
    expect(restart).toHaveLength(1);
    expect(depBuilds).toBe(4);
    expect(watchdogRuns).toBe(2);
    expect(watchRuns).toBe(1);
    expect(restartRuns).toBe(1);
  });
});
