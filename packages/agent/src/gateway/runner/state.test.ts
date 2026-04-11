import { describe, expect, it } from "bun:test";
import {
  type GatewayRunnerHistoryWindow,
  GatewayRunnerStateBookkeeping,
} from "@/gateway/runner/state";
import type { GatewayDaemonState } from "../daemon-state";
import {
  capabilitiesForPlatform,
  type PlatformAdapter,
  type PlatformHealth,
} from "../platforms/base";
import type {
  GatewayControlPlaneView,
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
} from "../state/state-snapshot";

function createAdapter(health: PlatformHealth): PlatformAdapter {
  return {
    name: health.platform,
    async start() {},
    async stop() {},
    async health() {
      return health;
    },
    async send() {
      throw new Error("send should not be called in bookkeeping tests");
    },
    canReceive() {
      return true;
    },
  };
}

function createControlPlane(
  platform: PlatformHealth["platform"],
): GatewayControlPlaneView {
  return {
    totals: {
      configured: 1,
      gatewayEnabled: 1,
      operationalTransports: 1,
    },
    transportInventory: [
      {
        platform,
        source: "official",
        configEnabled: true,
        gatewayEnabled: true,
        operational: true,
        detail: `${platform} operational`,
        reason: "live",
      },
    ],
    messagingBridge: [],
  } as unknown as GatewayControlPlaneView;
}

function createHistoryWindow(
  platform: PlatformHealth["platform"],
): GatewayRunnerHistoryWindow {
  return {
    allTraces: [
      {
        traceId: "trace-1",
        at: "2026-03-30T12:00:00.000Z",
        kind: "receive",
        platform,
        detail: `${platform} received`,
        roomId: "room-1",
        userId: "user-1",
      },
    ],
    traces: [
      {
        traceId: "trace-1",
        at: "2026-03-30T12:00:00.000Z",
        kind: "receive",
        platform,
        detail: `${platform} received`,
        roomId: "room-1",
        userId: "user-1",
      },
    ],
    inbox: [
      {
        recordId: "inbox-1",
        at: "2026-03-30T12:00:00.000Z",
        platform,
        traceId: "trace-1",
        status: "accepted",
        userId: "user-1",
        roomId: "room-1",
        textPreview: "hello",
        attachmentCount: 0,
        attachmentKinds: [],
        attachmentNames: [],
        attachmentUrls: [],
        attachmentMimeTypes: [],
        metadataKeys: [],
        metadata: {},
      },
    ],
    outbox: [],
    attachments: [],
    deliveries: [],
    sessions: [],
  };
}

describe("gateway runner state bookkeeping", () => {
  it("projects traces into platform state and merges readiness for inactive platforms", async () => {
    const platformStates = new Map<
      PlatformHealth["platform"],
      GatewayPlatformStateView
    >();
    const restartBackoffByPlatform = new Map();
    const daemonState: GatewayDaemonState = {
      heartbeatRuns: 1,
      watchdogRuns: 1,
      restartRuns: 0,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
      lastReason: "manual",
    };
    const apiHealth: PlatformHealth = {
      platform: "api",
      status: "running",
      ready: true,
      mode: "mock",
      capabilities: capabilitiesForPlatform("api"),
      detail: "api ready",
      events: [],
      presence: {
        status: "online",
        activity: "api active",
        lastPresenceChangeAt: "2026-03-30T12:00:00.000Z",
      },
      lastHeartbeatAt: "2026-03-30T12:01:00.000Z",
    };
    const helper = new GatewayRunnerStateBookkeeping({
      adapters: new Map([["api", createAdapter(apiHealth)]]),
      platformStates,
      restartBackoffByPlatform,
      daemonState,
      resolveNativeMessagingPlugin: () => undefined,
      getConfiguredPlatforms: () => ["api", "signal"],
      isPlatformEnabled: () => true,
      getTransportControlPlane: () => createControlPlane("api"),
      isRunning: () => true,
      getSnapshotPaths: () => ({
        snapshotPath: "/tmp/gateway-state.json",
        historyPath: "/tmp/gateway-state-history.jsonl",
      }),
      getWatchdogAt: () => daemonState.lastWatchdogAt,
      loadHistoryWindow: () => createHistoryWindow("api"),
      persistSnapshot: async () => {},
    });

    helper.ensureRestartState("api");
    helper.updatePlatformStateFromTrace({
      traceId: "trace-1",
      at: "2026-03-30T12:00:00.000Z",
      kind: "receive",
      platform: "api",
      detail: "api received",
      roomId: "room-1",
      userId: "user-1",
    });

    const readiness = await helper.collectReadiness();
    const apiState = platformStates.get("api");
    const signalState = platformStates.get("signal");
    const daemon = helper.buildDaemonRuntimeState();

    expect(readiness.map((entry) => entry.platform)).toEqual(["api", "signal"]);
    expect(apiState?.traceCount).toBe(1);
    expect(apiState?.receiveCount).toBe(1);
    expect(apiState?.ready).toBe(true);
    expect(apiState?.presence.status).toBe("online");
    expect(apiState?.lastHeartbeatAt).toBe("2026-03-30T12:01:00.000Z");
    expect(signalState?.ready).toBe(false);
    expect(signalState?.detail).toContain(
      "Lightweight webhook-normalized support is active for signal",
    );
    expect(daemon.watchdog.running).toBe(true);
    expect(daemon.watchdog.activePlatforms).toBe(1);
    expect(daemon.watchdog.unhealthyPlatforms).toBe(1);
    expect(daemon.restartQueue).toEqual([
      expect.objectContaining({
        platform: "api",
        failures: 0,
      }),
    ]);
  });

  it("builds and persists history snapshots from the shared bookkeeping state", async () => {
    const platformStates = new Map<
      PlatformHealth["platform"],
      GatewayPlatformStateView
    >();
    const daemonState: GatewayDaemonState = {
      heartbeatRuns: 2,
      watchdogRuns: 3,
      restartRuns: 1,
      restartRecoveries: 0,
      restartBackoffs: 0,
      watchdogSkips: 0,
      lastHeartbeatAt: "2026-03-30T12:03:00.000Z",
      lastWatchdogAt: "2026-03-30T12:04:00.000Z",
      lastReason: "history",
    };
    const apiHealth: PlatformHealth = {
      platform: "api",
      status: "running",
      ready: true,
      mode: "mock",
      capabilities: capabilitiesForPlatform("api"),
      detail: "api transport healthy",
      events: [
        {
          at: "2026-03-30T12:03:00.000Z",
          kind: "heartbeat",
          detail: "api heartbeat",
        },
      ],
      presence: {
        status: "online",
        activity: "api active",
        lastPresenceChangeAt: "2026-03-30T12:03:00.000Z",
      },
      lastHeartbeatAt: "2026-03-30T12:03:00.000Z",
    };
    const persisted: Array<{
      reason: string;
      snapshot: GatewayHistorySnapshot;
    }> = [];
    const helper = new GatewayRunnerStateBookkeeping({
      adapters: new Map([["api", createAdapter(apiHealth)]]),
      platformStates,
      restartBackoffByPlatform: new Map(),
      daemonState,
      resolveNativeMessagingPlugin: () => undefined,
      getConfiguredPlatforms: () => ["api"],
      isPlatformEnabled: () => true,
      getTransportControlPlane: () => createControlPlane("api"),
      isRunning: () => true,
      getSnapshotPaths: () => ({
        snapshotPath: "/tmp/gateway-state.json",
        historyPath: "/tmp/gateway-state-history.jsonl",
      }),
      getWatchdogAt: () => daemonState.lastWatchdogAt,
      loadHistoryWindow: () => createHistoryWindow("api"),
      persistSnapshot: async (reason, snapshot) => {
        persisted.push({ reason, snapshot });
      },
    });

    const snapshot = await helper.snapshotState("history", 5, {
      platform: "api",
    });

    expect(snapshot.reason).toBe("history");
    expect(snapshot.snapshotPath).toBe("/tmp/gateway-state.json");
    expect(snapshot.historyPath).toBe("/tmp/gateway-state-history.jsonl");
    expect(snapshot.state.heartbeatAt).toBe("2026-03-30T12:03:00.000Z");
    expect(snapshot.state.watchdogAt).toBe("2026-03-30T12:04:00.000Z");
    expect(
      snapshot.state.platforms.some((entry) => entry.platform === "api"),
    ).toBe(true);
    expect(
      snapshot.transportSummaries.some((entry) => entry.platform === "api"),
    ).toBe(true);
    expect(
      snapshot.transportOverview.details.some(
        (entry) => entry.platform === "api",
      ),
    ).toBe(true);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.reason).toBe("history");
    expect(persisted[0]?.snapshot).toBe(snapshot);
  });
});
