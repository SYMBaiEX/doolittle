import { describe, expect, it } from "bun:test";
import type { DeliveredMessageRecord, PlatformName } from "@/types/gateway";
import {
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonState,
  type GatewayRestartState,
} from "./daemon-state";
import type { PlatformAdapter, PlatformHealth } from "./platforms/base";
import { capabilitiesForPlatform } from "./platforms/base";
import type { GatewayTraceRecord } from "./read/history-view";
import {
  type GatewaySupervisionDependencies,
  type GatewaySupervisionPlatformState,
  type GatewaySupervisionRecord,
  runGatewayRestart,
  runGatewayWatch,
  runGatewayWatchdog,
} from "./supervision/index";

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

function makeDelivery(platform: PlatformName): DeliveredMessageRecord {
  return {
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
    createdAt: "2026-03-29T12:00:00.000Z",
  };
}

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
  const traces: GatewayTraceRecord[] = [];
  const observations: Array<{
    platform: PlatformName;
    kind:
      | "start"
      | "stop"
      | "heartbeat"
      | "receive"
      | "authorize"
      | "route"
      | "respond"
      | "deliver"
      | "reject"
      | "edit";
    detail: string;
  }> = [];
  const snapshotReasons: Array<{ reason: string; limit?: number }> = [];
  const runtimeWrites: string[] = [];
  const currentAt = "2026-03-29T12:00:00.000Z";
  let lastSupervisionAt: string | undefined;

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
    send: async () => makeDelivery(platform),
    canReceive: () => true,
    observe: async () => undefined,
    start: async () => {
      await options?.start?.();
    },
    stop: async () => {
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
      observations.push({ platform, kind: event.kind, detail: event.detail });
      return Promise.resolve();
    },
    pushTrace(entry) {
      traces.push(entry);
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
    traces,
    observations,
    snapshotReasons,
    runtimeWrites,
    platformStates,
    getPlatformState,
    setLastSupervisionAt: () => lastSupervisionAt,
    makeAdapter,
  };
}

describe("gateway-supervision-flow", () => {
  it("runs watchdog supervision, restarts unhealthy adapters, and records Home Assistant watch cycles", async () => {
    const harness = createHarness();
    const homeassistantHealth = makeHealth(
      "homeassistant",
      "running",
      true,
      "homeassistant ready",
    );
    const apiHealth = makeHealth("api", "running", false, "api degraded");
    const homeassistantWatch = {
      watchedAt: "2026-03-29T12:00:05.000Z",
      count: 2,
      summary: "homeassistant watch summary",
    };
    let apiStopCount = 0;
    let apiStartCount = 0;
    harness.deps.adapters = new Map([
      [
        "homeassistant",
        harness.makeAdapter("homeassistant", homeassistantHealth, {
          watch: async () => homeassistantWatch,
        }),
      ],
      [
        "api",
        harness.makeAdapter("api", apiHealth, {
          stop: async () => {
            apiStopCount += 1;
          },
          start: async () => {
            apiStartCount += 1;
          },
        }),
      ],
    ]);

    const records = await runGatewayWatchdog(harness.deps, "manual");

    expect(records.map((record) => record.action)).toEqual([
      "health",
      "watch",
      "watch",
      "restart",
    ]);
    expect(apiStopCount).toBe(1);
    expect(apiStartCount).toBe(1);
    expect(harness.daemonState.watchdogRuns).toBe(1);
    expect(harness.daemonState.restartRuns).toBe(1);
    expect(harness.observations).toContainEqual({
      platform: "homeassistant",
      kind: "heartbeat",
      detail: homeassistantWatch.summary,
    });
    expect(harness.runtimeWrites).toHaveLength(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "watchdog:manual", limit: 20 },
    ]);
    expect(harness.setLastSupervisionAt()).toBe("2026-03-29T12:00:00.000Z");
    expect(harness.records).toHaveLength(records.length);
    expect(harness.getPlatformState("api").restartCount).toBe(1);
    expect(harness.getPlatformState("homeassistant").lastWatchdogAction).toBe(
      "healthy",
    );
  });

  it("runs watch and restart control-plane wrappers with the expected side effects", async () => {
    const harness = createHarness();
    const watchHealth = makeHealth("homeassistant", "running", true, "ready");
    harness.deps.adapters = new Map([
      [
        "homeassistant",
        harness.makeAdapter("homeassistant", watchHealth, {
          watch: async () => ({
            watchedAt: "2026-03-29T12:05:00.000Z",
            count: 1,
            summary: "watch summary",
          }),
        }),
      ],
    ]);

    const watchRecords = await runGatewayWatch(
      harness.deps,
      "homeassistant",
      "manual-watch",
    );
    const restartRecords = await runGatewayRestart(
      harness.deps,
      "api",
      "manual-restart",
    );

    expect(watchRecords).toHaveLength(1);
    expect(watchRecords[0]?.action).toBe("watch");
    expect(harness.traces).toHaveLength(1);
    expect(harness.traces[0]?.kind).toBe("heartbeat");
    expect(harness.traces[0]?.platform).toBe("homeassistant");
    expect(harness.runtimeWrites).toHaveLength(1);
    expect(harness.snapshotReasons).toContainEqual({
      reason: "watch:homeassistant:manual-watch",
      limit: 20,
    });
    expect(restartRecords).toEqual([
      expect.objectContaining({
        action: "skip",
        detail:
          "api restart skipped during manual-restart; adapter is not active.",
      }),
    ]);
  });
});
