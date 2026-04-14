import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import { heartbeatGatewayRunner } from "@/gateway/runner/lifecycle/heartbeat";
import { startGatewayRunnerLifecycle } from "@/gateway/runner/lifecycle/startup";
import { stopGatewayRunnerLifecycle } from "@/gateway/runner/lifecycle/stop";
import type { GatewayRunnerLifecycleHost } from "@/gateway/runner/lifecycle/types";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { PlatformName } from "@/types/gateway";
import {
  capabilitiesForPlatform,
  type PlatformAdapter,
} from "../platforms/base";

describe("gateway runner lifecycle", () => {
  it("starts adapters, records heartbeats, and shuts down cleanly", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-lifecycle-"));
    const config = {
      agentName: "test-agent",
      mode: "cli",
      host: "127.0.0.1",
      port: 0,
      dataDir: join(root, "data"),
      gatewayDataDir: join(root, "gateway"),
      homeAssistantUrl: "https://homeassistant.local",
      homeAssistantToken: "token",
      allowAllUsers: true,
      pairingDefaultMode: "allow",
    } as GatewayRunnerContext["config"];

    const gatewayConfig = loadGatewayConfig(config);
    for (const platform of Object.keys(gatewayConfig.platforms)) {
      gatewayConfig.platforms[
        platform as keyof typeof gatewayConfig.platforms
      ].enabled = platform === "api";
    }
    saveGatewayConfig(config, gatewayConfig);

    const traces: Array<{
      traceId: string;
      at: string;
      kind: "lifecycle" | "heartbeat";
      platform: PlatformName | "gateway";
      detail: string;
    }> = [];
    const observations: Array<{
      platform: "api";
      kind: string;
      detail: string;
    }> = [];
    const hookEvents: Array<{ name: string; payload: Record<string, string> }> =
      [];
    const restartPlatforms: string[] = [];
    const syncedStatuses: string[] = [];
    const snapshotReasons: string[] = [];
    const startupHeartbeats: string[] = [];
    const startupWatchdogs: string[] = [];
    const runtimeWrites: string[] = [];
    let running = false;
    let startedAt: string | undefined;
    let stoppedAt: string | undefined;
    let lastHeartbeatAt: string | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let supervisionInterval: ReturnType<typeof setInterval> | null = null;
    let startCount = 0;
    let stopCount = 0;

    const createStateSnapshot = (reason: string): GatewayStateSnapshot =>
      ({
        running,
        updatedAt: "2026-03-31T00:00:00.000Z",
        reason,
        snapshotPath: join(root, "gateway-state.json"),
        historyPath: join(root, "gateway-state-history.jsonl"),
        daemon: {
          policy: {
            heartbeatIntervalMs: 60_000,
            watchdogIntervalMs: 45_000,
            restartBaseDelayMs: 5_000,
            restartMaxDelayMs: 300_000,
            restartMultiplier: 2,
            restartJitterMs: 750,
          },
          state: host.daemonState,
          restartQueue: [],
          watchdog: {
            running,
            activePlatforms: host.adapters.size,
            unhealthyPlatforms: 0,
            restartablePlatforms: host.adapters.size,
            backoffPlatforms: 0,
          },
        },
        totals: {
          configuredPlatforms: host.adapters.size,
          activeAdapters: host.adapters.size,
          readyAdapters: host.adapters.size,
          gatewayEnabledTransports: host.adapters.size,
          operationalTransports: host.adapters.size,
          nativeAdapters: 0,
          mockAdapters: host.adapters.size,
          pluginMediatedAdapters: 0,
          officialPluginAdapters: 0,
          vendoredPluginAdapters: 0,
          totalTraces: traces.length,
          recentTraces: traces.length,
          inboxMessages: 0,
          outboxMessages: 0,
          attachmentRecords: 0,
          recentDeliveries: 0,
          recentSessions: 0,
        },
        platforms: [],
        transportOverview: {
          mismatchCount: 0,
          operationalCount: host.adapters.size,
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
      }) as GatewayStateSnapshot;

    const adapter: PlatformAdapter = {
      name: "api",
      async start() {
        startCount += 1;
      },
      async stop() {
        stopCount += 1;
      },
      async health() {
        return {
          platform: "api",
          status: "running",
          ready: true,
          mode: "mock",
          capabilities: capabilitiesForPlatform("api"),
          detail: "api ready",
          events: [],
        };
      },
      async send() {
        throw new Error("send should not be called in lifecycle tests");
      },
      canReceive() {
        return true;
      },
      async observe(event) {
        observations.push({
          platform: "api",
          kind: event.kind,
          detail: event.detail,
        });
      },
    };

    const host: GatewayRunnerLifecycleHost = {
      context: {
        config,
        services: {
          hooks: {
            emit(name: string, payload: Record<string, string>) {
              hookEvents.push({ name, payload });
              return Promise.resolve();
            },
          },
        } as unknown as GatewayRunnerContext["services"],
        runtime: {} as GatewayRunnerContext["runtime"],
      },
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
        return running;
      },
      set running(value: boolean) {
        running = value;
      },
      get startedAt() {
        return startedAt;
      },
      set startedAt(value: string | undefined) {
        startedAt = value;
      },
      get stoppedAt() {
        return stoppedAt;
      },
      set stoppedAt(value: string | undefined) {
        stoppedAt = value;
      },
      get lastHeartbeatAt() {
        return lastHeartbeatAt;
      },
      set lastHeartbeatAt(value: string | undefined) {
        lastHeartbeatAt = value;
      },
      get heartbeatInterval() {
        return heartbeatInterval;
      },
      set heartbeatInterval(value: ReturnType<typeof setInterval> | null) {
        heartbeatInterval = value;
      },
      get supervisionInterval() {
        return supervisionInterval;
      },
      set supervisionInterval(value: ReturnType<typeof setInterval> | null) {
        supervisionInterval = value;
      },
      createAdapter(platform) {
        expect(platform).toBe("api");
        return adapter;
      },
      ensureRestartState(platform) {
        restartPlatforms.push(platform);
      },
      syncPlatformStateFromHealth(health) {
        syncedStatuses.push(
          `${health.platform}:${health.status}:${health.ready}`,
        );
      },
      pushTrace(entry) {
        traces.push(entry);
      },
      observeAdapter(platform, event) {
        expect(platform).toBe("api");
        return adapter.observe?.(event) ?? Promise.resolve();
      },
      writeRuntimeStatus() {
        runtimeWrites.push("write");
      },
      snapshotState(reason) {
        snapshotReasons.push(reason);
        return Promise.resolve({
          updatedAt: "2026-03-31T00:00:00.000Z",
          reason,
          snapshotPath: join(root, "gateway-state.json"),
          historyPath: join(root, "gateway-state-history.jsonl"),
          readiness: [],
          transportOverview: {
            mismatchCount: 0,
            operationalCount: host.adapters.size,
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
          state: createStateSnapshot(reason),
        } as unknown as GatewayHistorySnapshot);
      },
      runHeartbeat(reason) {
        startupHeartbeats.push(reason);
        return Promise.resolve(createStateSnapshot(reason));
      },
      runWatchdog(reason) {
        startupWatchdogs.push(reason);
        return Promise.resolve([]);
      },
    };

    try {
      await startGatewayRunnerLifecycle(host);

      expect(host.running).toBe(true);
      expect(host.adapters.get("api")).toBe(adapter);
      expect(startCount).toBe(1);
      expect(restartPlatforms).toEqual(["api"]);
      expect(syncedStatuses).toEqual(["api:running:true"]);
      expect(startupHeartbeats).toEqual(["startup"]);
      expect(startupWatchdogs).toEqual(["startup"]);
      expect(host.startedAt).toBeDefined();
      expect(host.stoppedAt).toBeUndefined();
      expect(host.heartbeatInterval).not.toBeNull();
      expect(host.supervisionInterval).not.toBeNull();
      expect(
        hookEvents.some(
          (event) =>
            event.name === "gateway:startup" &&
            event.payload.platforms === "api",
        ),
      ).toBe(true);
      expect(
        traces.some(
          (entry) =>
            entry.kind === "lifecycle" &&
            entry.platform === "api" &&
            entry.detail.includes("Adapter started"),
        ),
      ).toBe(true);

      const state = await heartbeatGatewayRunner(host, "manual");

      expect(host.lastHeartbeatAt).toBeDefined();
      expect(host.daemonState.heartbeatRuns).toBe(1);
      expect(host.daemonState.lastReason).toBe("manual");
      expect(state.totals.activeAdapters).toBe(1);
      expect(
        observations.some(
          (event) =>
            event.kind === "heartbeat" &&
            event.detail.includes("transport heartbeat"),
        ),
      ).toBe(true);
      expect(
        hookEvents.some(
          (event) =>
            event.name === "gateway:heartbeat" &&
            event.payload.status === "running",
        ),
      ).toBe(true);

      await stopGatewayRunnerLifecycle(host);

      expect(host.running).toBe(false);
      expect(host.stoppedAt).toBeDefined();
      expect(host.heartbeatInterval).toBeNull();
      expect(host.supervisionInterval).toBeNull();
      expect(host.adapters.size).toBe(0);
      expect(stopCount).toBe(1);
      expect(snapshotReasons).toEqual(["manual", "stop"]);
      expect(runtimeWrites.length).toBeGreaterThanOrEqual(3);
      expect(
        hookEvents.some(
          (event) =>
            event.name === "gateway:shutdown" &&
            event.payload.status === "stopped",
        ),
      ).toBe(true);
      expect(
        traces.some(
          (entry) =>
            entry.kind === "lifecycle" &&
            entry.platform === "gateway" &&
            entry.detail.includes("Gateway stopped"),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
