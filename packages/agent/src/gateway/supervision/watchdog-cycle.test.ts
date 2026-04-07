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
} from "./index";
import { runGatewayWatchdog } from "./index";

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
  const records: Array<{ action: string; detail: string }> = [];
  const snapshotReasons: Array<{ reason: string; limit?: number }> = [];
  const runtimeWrites: string[] = [];
  const currentAt = "2026-03-29T12:00:00.000Z";

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
    start: async () => undefined,
    stop: async () => undefined,
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
    setLastSupervisionAt() {
      return undefined;
    },
    recordSupervision(platform, action, detail) {
      const record = { action, detail };
      records.push(record);
      return {
        at: currentAt,
        platform,
        action,
        detail,
      };
    },
    observeAdapter() {
      return Promise.resolve();
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
    makeAdapter,
    ensureRestartState: deps.ensureRestartState,
  };
}

describe("gateway supervision watchdog cycle", () => {
  it("records a backoff outcome when the restart window is still closed", async () => {
    const harness = createHarness();
    const health = makeHealth("api", "running", false, "api degraded");
    harness.deps.adapters = new Map([
      ["api", harness.makeAdapter("api", health)],
    ]);
    const restartState = harness.ensureRestartState("api");
    restartState.nextEligibleAt = new Date(Date.now() + 60_000).toISOString();
    restartState.backoffMs = 12_500;

    const records = await runGatewayWatchdog(harness.deps, "manual");

    expect(records).toHaveLength(1);
    expect(records[0]?.action).toBe("backoff");
    expect(harness.daemonState.restartBackoffs).toBe(1);
    expect(harness.runtimeWrites).toHaveLength(1);
    expect(harness.snapshotReasons).toEqual([
      { reason: "watchdog:manual", limit: 20 },
    ]);
    expect(harness.records[0]?.detail).toContain("restart delayed");
  });
});
