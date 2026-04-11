import { describe, expect, it } from "bun:test";
import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import {
  buildGatewayRunnerLifecycleHost,
  buildGatewayRunnerSupervisionDeps,
} from "@/gateway/runner/host";
import type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import {
  capabilitiesForPlatform,
  type PlatformAdapter,
} from "../platforms/base";

describe("gateway runner host builders", () => {
  it("buildGatewayRunnerLifecycleHost forwards state accessors and host callbacks", async () => {
    const traces: string[] = [];
    const snapshotCalls: Array<{ reason: string; limit: number }> = [];
    const heartbeatCalls: string[] = [];
    const watchdogCalls: string[] = [];
    const adapterCalls: PlatformName[] = [];
    let running = false;
    let lastHeartbeatAt: string | undefined;
    const observeEvents: Array<{ platform: PlatformName; kind: string }> = [];

    const host = buildGatewayRunnerLifecycleHost({
      context: {
        config: { gatewayDataDir: "/tmp/doolittle-gateway-host" },
        services: {
          hooks: {
            emit: async () => {},
          },
        },
        runtime: {},
      } as unknown as GatewayRunnerContext,
      adapters: new Map(),
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
      getStartedAt: () => undefined,
      setStartedAt: () => {},
      getStoppedAt: () => undefined,
      setStoppedAt: () => {},
      getLastHeartbeatAt: () => lastHeartbeatAt,
      setLastHeartbeatAt: (value) => {
        lastHeartbeatAt = value;
      },
      getHeartbeatInterval: () => null,
      setHeartbeatInterval: () => {},
      getSupervisionInterval: () => null,
      setSupervisionInterval: () => {},
      createAdapter: (platform) => {
        adapterCalls.push(platform);
        return {
          name: platform,
          async start() {},
          async stop() {},
          async health() {
            return {
              platform,
              status: "running",
              ready: true,
              mode: "mock",
              capabilities: capabilitiesForPlatform(platform),
              detail: `${platform} ready`,
              events: [],
            };
          },
          canReceive: () => true,
          async send() {
            throw new Error("send should not be called in host tests");
          },
        } as unknown as PlatformAdapter;
      },
      ensureRestartState: () => {},
      syncPlatformStateFromHealth: () => {},
      pushTrace: (entry) => {
        traces.push(entry.kind);
      },
      observeAdapter: async (platform, event) => {
        observeEvents.push({ platform, kind: event.kind });
      },
      writeRuntimeStatus: () => {},
      snapshotState: async (reason, limit): Promise<GatewayHistorySnapshot> => {
        snapshotCalls.push({ reason, limit });
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
          reason,
          snapshotPath: "/tmp/snapshot.json",
          historyPath: "/tmp/history.jsonl",
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
            running: true,
            updatedAt: "2026-04-01T00:00:00.000Z",
            reason,
            snapshotPath: "/tmp/snapshot.json",
            historyPath: "/tmp/history.jsonl",
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
          } as GatewayStateSnapshot,
        };
      },
      runHeartbeat: async (reason) => {
        heartbeatCalls.push(reason);
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
          reason,
          running: true,
          snapshotPath: "",
          historyPath: "",
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
              heartbeatRuns: 1,
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
      },
      runWatchdog: async (reason) => {
        watchdogCalls.push(reason);
        return [] as GatewaySupervisionRecord[];
      },
    });

    const adapter = host.createAdapter("api");
    host.adapters.set("api", adapter);
    host.running = true;
    host.lastHeartbeatAt = "2026-04-01T00:00:00.000Z";
    await host.snapshotState("snapshot", 5);
    await host.runHeartbeat("manual");
    await host.runWatchdog("interval");
    await host.observeAdapter("api", {
      at: "2026-04-01T00:00:00.000Z",
      kind: "heartbeat",
      detail: "unit-test",
    });

    expect(adapterCalls).toEqual(["api"]);
    expect(host.adapters.has("api")).toBe(true);
    expect(running).toBe(true);
    expect(lastHeartbeatAt).toBe("2026-04-01T00:00:00.000Z");
    expect(snapshotCalls).toEqual([{ reason: "snapshot", limit: 5 }]);
    expect(heartbeatCalls).toEqual(["manual"]);
    expect(watchdogCalls).toEqual(["interval"]);
    expect(traces).toHaveLength(0);
    expect(observeEvents).toEqual([{ platform: "api", kind: "heartbeat" }]);
  });

  it("buildGatewayRunnerSupervisionDeps binds supervision bookkeeping dependencies", () => {
    const platformCalls: PlatformName[] = [];
    const restartState: GatewayRestartState = {
      failures: 0,
      backoffMs: 5_000,
      nextEligibleAt: undefined,
      lastAction: "healthy",
    };
    const deps = buildGatewayRunnerSupervisionDeps({
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
        ensureRestartState: () => restartState,
        ensurePlatformState: (platform) => {
          platformCalls.push(platform);
          return {
            platform,
            source: "mock",
            mode: "mock",
            status: "running",
            ready: true,
            transportState: "live",
            detail: "ok",
            presence: {
              status: "online",
              activity: "ready",
            },
            traceCount: 0,
            sendCount: 0,
            receiveCount: 0,
            authorizeCount: 0,
            routeCount: 0,
            respondCount: 0,
            editCount: 0,
            rejectCount: 0,
            heartbeatCount: 0,
            pairCount: 0,
            attachCount: 0,
            restartCount: 0,
            restartFailureCount: 0,
            nextRestartAt: undefined,
          } as unknown as GatewayPlatformStateView;
        },
      },
      recording: {
        recordSupervision: (platform, action, detail) => ({
          at: "2026-04-01T00:00:00.000Z",
          platform,
          action,
          detail,
        }),
        pushTrace: () => {},
      },
      setLastSupervisionAt: () => {},
      observeAdapter: async () => {},
      writeRuntimeStatus: () => {},
      snapshotState: async () => {
        return {
          updatedAt: "2026-04-01T00:00:00.000Z",
          reason: "watchdog",
          snapshotPath: "/tmp/snapshot.json",
          historyPath: "/tmp/history.jsonl",
          readiness: [],
          transportOverview: {
            mismatchCount: 0,
            operationalCount: 1,
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
          state: {} as GatewayStateSnapshot,
        };
      },
    });

    const state = deps.getPlatformState("api");

    expect(platformCalls).toEqual(["api"]);
    expect(state.ready).toBe(true);
    expect(deps.recordSupervision("api", "health", "ok").platform).toBe("api");
  });
});
