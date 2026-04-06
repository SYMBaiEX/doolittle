import { describe, expect, it } from "bun:test";
import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { GatewayTraceRecord } from "@/gateway/read/history-view";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import {
  createGatewayRunnerLifecycleHost,
  createGatewayRunnerSupervisionDeps,
} from "@/gateway/runner/factories";
import type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { PlatformName } from "@/types/gateway";
import {
  capabilitiesForPlatform,
  type PlatformAdapter,
  type PlatformHealth,
} from "../platforms/base";

describe("gateway runner factories", () => {
  it("builds a lifecycle host that proxies mutable runner state and hooks", async () => {
    const adapter: PlatformAdapter = {
      name: "api",
      async start() {},
      async stop() {},
      async health() {
        return {
          platform: "api",
          status: "running",
          ready: true,
          mode: "mock",
          capabilities: capabilitiesForPlatform("api"),
          detail: "ok",
          events: [],
        } satisfies PlatformHealth;
      },
      async send() {
        throw new Error("not used");
      },
      canReceive() {
        return true;
      },
    };

    let running = false;
    let startedAt: string | undefined;
    let stoppedAt: string | undefined;
    let lastHeartbeatAt: string | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let supervisionInterval: ReturnType<typeof setInterval> | null = null;
    const createdPlatforms: PlatformName[] = [];
    const restartPlatforms: PlatformName[] = [];
    const syncedStatuses: string[] = [];
    const traces: GatewayTraceRecord[] = [];
    const observedEvents: Array<{ platform: PlatformName; kind: string }> = [];
    const writeRuntimeStatusCalls: string[] = [];
    const snapshotReasons: Array<{ reason: string; limit: number }> = [];
    const heartbeatReasons: string[] = [];
    const watchdogReasons: string[] = [];

    const host = createGatewayRunnerLifecycleHost({
      context: {
        config: {} as GatewayRunnerContext["config"],
        services: {} as GatewayRunnerContext["services"],
        runtime: {} as GatewayRunnerContext["runtime"],
      } as GatewayRunnerContext,
      adapters: new Map<PlatformName, PlatformAdapter>(),
      daemonState: {
        heartbeatRuns: 0,
        watchdogRuns: 0,
        restartRuns: 0,
        restartRecoveries: 0,
        restartBackoffs: 0,
        watchdogSkips: 0,
      } as GatewayDaemonState,
      getRunning: () => running,
      setRunning: (value) => {
        running = value;
      },
      getStartedAt: () => startedAt,
      setStartedAt: (value) => {
        startedAt = value;
      },
      getStoppedAt: () => stoppedAt,
      setStoppedAt: (value) => {
        stoppedAt = value;
      },
      getLastHeartbeatAt: () => lastHeartbeatAt,
      setLastHeartbeatAt: (value) => {
        lastHeartbeatAt = value;
      },
      getHeartbeatInterval: () => heartbeatInterval,
      setHeartbeatInterval: (value) => {
        heartbeatInterval = value;
      },
      getSupervisionInterval: () => supervisionInterval,
      setSupervisionInterval: (value) => {
        supervisionInterval = value;
      },
      createAdapter: (platform) => {
        createdPlatforms.push(platform);
        return adapter;
      },
      ensureRestartState: (platform) => {
        restartPlatforms.push(platform);
      },
      syncPlatformStateFromHealth: (health) => {
        syncedStatuses.push(
          `${health.platform}:${health.status}:${health.ready}`,
        );
      },
      pushTrace: (entry) => {
        traces.push(entry);
      },
      observeAdapter: async (platform, event) => {
        observedEvents.push({ platform, kind: event.kind });
      },
      writeRuntimeStatus: () => {
        writeRuntimeStatusCalls.push("write");
      },
      snapshotState: async (reason, limit) => {
        snapshotReasons.push({ reason, limit });
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
          reason,
          snapshotPath: "/tmp/gateway.json",
          historyPath: "/tmp/gateway-history.jsonl",
          readiness: [],
          transportOverview: {
            mismatchCount: 0,
            operationalCount: 0,
            details: [],
          },
          transportSummaries: [],
          transportJournal: [],
          traces: [],
          inbox: [],
          outbox: [],
          attachments: [],
          deliveries: [],
          sessions: [],
          state: {
            updatedAt: "2026-04-01T00:00:00.000Z",
          } as GatewayStateSnapshot,
        };
      },
      runHeartbeat: async (reason) => {
        heartbeatReasons.push(reason);
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
        } as GatewayStateSnapshot;
      },
      runWatchdog: async (reason) => {
        watchdogReasons.push(reason);
        return [];
      },
    });

    expect(host.running).toBe(false);
    host.running = true;
    host.startedAt = "2026-04-01T00:00:00.000Z";
    host.stoppedAt = "2026-04-01T00:01:00.000Z";
    host.lastHeartbeatAt = "2026-04-01T00:02:00.000Z";
    host.heartbeatInterval = setInterval(() => {}, 1000);
    host.supervisionInterval = setInterval(() => {}, 1000);
    await host.createAdapter("api");
    host.ensureRestartState("api");
    host.syncPlatformStateFromHealth({
      platform: "api",
      status: "running",
      ready: true,
      mode: "mock",
      capabilities: capabilitiesForPlatform("api"),
      detail: "ok",
      events: [],
    });
    host.pushTrace({
      traceId: "trace-1",
      at: "2026-04-01T00:00:00.000Z",
      kind: "lifecycle",
      platform: "gateway",
      detail: "ok",
    });
    await host.observeAdapter("api", {
      at: "2026-04-01T00:00:00.000Z",
      kind: "start",
      detail: "ok",
    });
    host.writeRuntimeStatus();
    await host.snapshotState("snapshot", 10);
    await host.runHeartbeat("heartbeat");
    await host.runWatchdog("watchdog");

    expect(running).toBe(true);
    expect(startedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(stoppedAt).toBe("2026-04-01T00:01:00.000Z");
    expect(lastHeartbeatAt).toBe("2026-04-01T00:02:00.000Z");
    expect(createdPlatforms).toEqual(["api"]);
    expect(restartPlatforms).toEqual(["api"]);
    expect(syncedStatuses).toEqual(["api:running:true"]);
    expect(traces).toHaveLength(1);
    expect(observedEvents).toEqual([{ platform: "api", kind: "start" }]);
    expect(writeRuntimeStatusCalls).toEqual(["write"]);
    expect(snapshotReasons).toEqual([{ reason: "snapshot", limit: 10 }]);
    expect(heartbeatReasons).toEqual(["heartbeat"]);
    expect(watchdogReasons).toEqual(["watchdog"]);

    clearInterval(host.heartbeatInterval as ReturnType<typeof setInterval>);
    clearInterval(host.supervisionInterval as ReturnType<typeof setInterval>);
  });

  it("builds supervision dependencies that forward bookkeeping and recording calls", async () => {
    const ensureRestartStateCalls: PlatformName[] = [];
    const ensurePlatformStateCalls: PlatformName[] = [];
    const recordCalls: Array<{
      platform: PlatformName | "gateway";
      action: string;
      detail: string;
    }> = [];
    const traceCalls: GatewayTraceRecord[] = [];
    const observeCalls: Array<{ platform: PlatformName; kind: string }> = [];
    const snapshotReasons: Array<{ reason: string; limit?: number }> = [];
    const writeRuntimeStatusCalls: string[] = [];
    let lastSupervisionAt = "";

    const deps = createGatewayRunnerSupervisionDeps({
      adapters: new Map(),
      daemonState: {
        heartbeatRuns: 0,
        watchdogRuns: 0,
        restartRuns: 0,
        restartRecoveries: 0,
        restartBackoffs: 0,
        watchdogSkips: 0,
      } as GatewayDaemonState,
      stateBookkeeping: {
        ensureRestartState(platform) {
          ensureRestartStateCalls.push(platform);
          return {
            failures: 0,
            backoffMs: 5_000,
          } satisfies GatewayRestartState;
        },
        ensurePlatformState(platform) {
          ensurePlatformStateCalls.push(platform);
          return {
            platform,
            source: "native",
            status: "running",
            ready: true,
            transportState: "live",
            kind: "native",
            detail: "ok",
            traceCount: 0,
            receiveCount: 0,
            routeCount: 0,
            respondCount: 0,
            deliverCount: 0,
            editCount: 0,
            heartbeatCount: 0,
            startCount: 0,
            stopCount: 0,
            inboxCount: 0,
            outboxCount: 0,
            attachmentCount: 0,
            pluginType: "native",
            pluginName: platform,
            gatewayEnabled: true,
            sourceEnabled: true,
            operational: true,
            support: "native",
            transportPresence: { status: "online" },
          } as unknown as GatewayPlatformStateView;
        },
      },
      recording: {
        recordSupervision(platform, action, detail) {
          recordCalls.push({ platform, action, detail });
          return {
            at: "2026-04-01T00:00:00.000Z",
            platform,
            action,
            detail,
          };
        },
        pushTrace(entry) {
          traceCalls.push(entry);
        },
      },
      setLastSupervisionAt(at) {
        lastSupervisionAt = at;
      },
      observeAdapter: async (platform, event) => {
        observeCalls.push({ platform, kind: event.kind });
      },
      writeRuntimeStatus() {
        writeRuntimeStatusCalls.push("write");
      },
      snapshotState: async (reason, limit) => {
        snapshotReasons.push({ reason, limit });
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
          reason,
        } as GatewayHistorySnapshot;
      },
    });

    deps.setLastSupervisionAt("2026-04-01T00:00:00.000Z");
    await deps.observeAdapter("api", {
      at: "2026-04-01T00:00:00.000Z",
      kind: "heartbeat",
      detail: "ok",
    });
    deps.writeRuntimeStatus();
    await deps.snapshotState("snapshot", 10);
    deps.ensureRestartState("api");
    deps.getPlatformState("api");
    deps.recordSupervision("gateway", "health", "healthy");
    deps.pushTrace?.({
      traceId: "trace-1",
      at: "2026-04-01T00:00:00.000Z",
      kind: "lifecycle",
      platform: "gateway",
      detail: "ok",
    });

    expect(lastSupervisionAt).toBe("2026-04-01T00:00:00.000Z");
    expect(ensureRestartStateCalls).toEqual(["api"]);
    expect(ensurePlatformStateCalls).toEqual(["api"]);
    expect(recordCalls).toEqual([
      { platform: "gateway", action: "health", detail: "healthy" },
    ]);
    expect(traceCalls).toHaveLength(1);
    expect(observeCalls).toEqual([{ platform: "api", kind: "heartbeat" }]);
    expect(writeRuntimeStatusCalls).toEqual(["write"]);
    expect(snapshotReasons).toEqual([{ reason: "snapshot", limit: 10 }]);
  });
});
