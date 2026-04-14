import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../platforms/base";
import type {
  GatewayControlPlaneView,
  GatewayHistorySnapshot,
} from "../state/state-snapshot";
import type { GatewaySupervisionRecord } from "../supervision/index";
import { GatewayHistoryView } from "./history-view";
import {
  GatewayRunnerReadModel,
  type GatewayRuntimeStatus,
} from "./read-model";

function buildReadModel() {
  const traceLog = [
    {
      traceId: "trace-1",
      at: "2026-03-29T10:00:00.000Z",
      kind: "receive" as const,
      platform: "api" as const,
      detail: "received",
      sessionId: "session-1",
      userId: "user-1",
      roomId: "room-1",
      messageId: "msg-1",
    },
    {
      traceId: "trace-2",
      at: "2026-03-29T10:01:00.000Z",
      kind: "deliver" as const,
      platform: "api" as const,
      detail: "delivered",
      sessionId: "session-1",
      userId: "user-1",
      roomId: "room-1",
      deliveryId: "delivery-1",
    },
  ];
  const inboxLog = [
    {
      recordId: "inbox-1",
      at: "2026-03-29T10:00:00.000Z",
      platform: "api" as const,
      sessionId: "session-1",
      traceId: "trace-1",
      status: "accepted" as const,
      userId: "user-1",
      roomId: "room-1",
      messageId: "msg-1",
      textPreview: "hello",
      attachmentCount: 1,
      attachmentKinds: ["image"],
      attachmentNames: ["snapshot"],
      attachmentUrls: ["https://example.com/snapshot.png"],
      attachmentMimeTypes: ["image/png"],
      metadataKeys: ["source"],
      metadata: { source: "test" },
    },
  ];
  const outboxLog = [
    {
      recordId: "outbox-1",
      at: "2026-03-29T10:01:00.000Z",
      platform: "api" as const,
      sessionId: "session-1",
      traceId: "trace-2",
      status: "sent" as const,
      deliveryId: "delivery-1",
      userId: "user-1",
      roomId: "room-1",
      textPreview: "reply",
      attachmentCount: 0,
      attachmentKinds: [],
      attachmentNames: [],
      attachmentUrls: [],
      attachmentMimeTypes: [],
      metadataKeys: [],
      metadata: {},
    },
  ];
  const attachmentLog = [
    {
      attachmentId: "attachment-1",
      recordId: "inbox-1",
      at: "2026-03-29T10:00:30.000Z",
      direction: "inbox" as const,
      platform: "api" as const,
      sessionId: "session-1",
      traceId: "trace-1",
      messageId: "msg-1",
      userId: "user-1",
      roomId: "room-1",
      kind: "image",
      name: "snapshot",
      url: "https://example.com/snapshot.png",
      mimeType: "image/png",
      metadataKeys: [],
      metadata: {},
    },
  ];
  const supervisionLog: GatewaySupervisionRecord[] = [
    {
      at: "2026-03-29T10:02:00.000Z",
      platform: "api",
      action: "health",
      detail: "healthy",
    },
    {
      at: "2026-03-29T10:03:00.000Z",
      platform: "gateway",
      action: "recover",
      detail: "recovered",
      attempt: 2,
    },
  ];
  const historyView = new GatewayHistoryView({
    traceLog,
    inboxLog,
    outboxLog,
    attachmentLog,
    recentDeliveries: () => [
      {
        id: "delivery-1",
        target: {
          platform: "api" as const,
          channelId: "room-1",
          userId: "user-1",
          mode: "explicit" as const,
        },
        text: "reply",
        createdAt: "2026-03-29T10:01:00.000Z",
      },
    ],
    listSessions: () => [
      {
        sessionKey: "session-1",
        platform: "api" as const,
        roomId: "room-1",
        userId: "user-1",
        createdAt: "2026-03-29T10:00:00.000Z",
        updatedAt: "2026-03-29T10:03:00.000Z",
      },
    ],
  });
  const controlPlane = {
    totals: {
      configured: 1,
      configEnabled: 1,
      gatewayEnabled: 1,
      operational: 1,
      operationalTransports: 1,
    },
    transportInventory: [
      {
        platform: "api" as const,
        source: "official",
        configEnabled: true,
        gatewayEnabled: true,
        operational: true,
        detail: "api transport operational",
      },
    ],
    messagingBridge: [
      {
        platform: "api" as const,
        pluginId: "native.api",
        pluginSource: "official" as const,
        pluginEnabled: true,
        serviceAvailable: true,
        live: true,
        detail: "bridge online",
      },
    ],
  } as unknown as GatewayControlPlaneView;
  const readiness = [
    {
      platform: "api" as const,
      status: "running" as const,
      mode: "native" as const,
      ready: true,
      detail: "api ready",
      events: [],
      presence: {
        status: "online" as const,
        activity: "api active",
      },
      lastHeartbeatAt: "2026-03-29T10:03:00.000Z",
    },
  ] as unknown as PlatformHealth[];
  const state = {
    running: true,
    updatedAt: "2026-03-29T10:04:00.000Z",
    reason: "history",
    snapshotPath: "/tmp/gateway-state.json",
    historyPath: "/tmp/gateway-state-history.jsonl",
    daemon: {
      policy: {
        heartbeatIntervalMs: 10_000,
        watchdogIntervalMs: 15_000,
        restartBaseDelayMs: 2_000,
        restartMaxDelayMs: 60_000,
        restartMultiplier: 2,
        restartJitterMs: 500,
      },
      state: {
        watchdogRuns: 2,
      },
      watchdog: {
        running: true,
      },
      restartQueue: [],
    } as unknown as GatewayRuntimeStatus["daemon"],
    totals: {
      configuredPlatforms: 1,
      activeAdapters: 1,
      readyAdapters: 1,
      gatewayEnabledTransports: 1,
      operationalTransports: 1,
      nativeAdapters: 1,
      mockAdapters: 0,
      pluginMediatedAdapters: 0,
      officialPluginAdapters: 1,
      vendoredPluginAdapters: 0,
      totalTraces: 2,
      recentTraces: 2,
      inboxMessages: 1,
      outboxMessages: 1,
      attachmentRecords: 1,
      recentDeliveries: 1,
      recentSessions: 1,
    },
    platforms: [
      {
        platform: "api" as const,
        nativePluginSource: "official" as const,
        status: "running" as const,
        mode: "native" as const,
        ready: false,
        transportState: "degraded" as const,
        detail: "api transport degraded",
        presence: {
          status: "online" as const,
          activity: "api active",
        },
        sendCount: 0,
        receiveCount: 1,
        routeCount: 1,
        respondCount: 1,
        heartbeatCount: 1,
        authorizeCount: 0,
        rejectCount: 0,
        restartCount: 2,
        restartFailureCount: 1,
        inboxCount: 1,
        outboxCount: 1,
        attachmentCount: 1,
        eventCount: 0,
        traceCount: 2,
        lastUpdatedAt: "2026-03-29T10:04:00.000Z",
        lastTraceAt: "2026-03-29T10:01:00.000Z",
        lastTraceKind: "deliver" as const,
        lastEventAt: "2026-03-29T10:03:00.000Z",
      },
    ],
    transportOverview: {
      mismatchCount: 1,
      operationalCount: 1,
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
  };
  const snapshotCalls: Array<{
    reason: string;
    limit?: number;
    filters?: { platform?: PlatformName; sessionId?: string };
  }> = [];
  const receivedMessages: Array<Record<string, string | undefined>> = [];
  const runtimeStatusMeta: GatewayRuntimeStatus = {
    pid: 4242,
    running: true,
    updatedAt: "2026-03-29T10:05:00.000Z",
    startedAt: "2026-03-29T10:00:00.000Z",
    stoppedAt: undefined,
    lastHeartbeatAt: "2026-03-29T10:04:00.000Z",
    lastWatchdogAt: "2026-03-29T10:04:30.000Z",
    lastSupervisionAt: "2026-03-29T10:04:45.000Z",
    supervisionEvents: supervisionLog.length,
    adapters: ["api"],
    daemon: state.daemon as GatewayRuntimeStatus["daemon"],
    journalPaths: {
      snapshot: "/tmp/gateway-state.json",
      history: "/tmp/gateway-state-history.jsonl",
      runtime: "/tmp/gateway-runtime.json",
      supervision: "/tmp/gateway-supervision.jsonl",
      inbox: "/tmp/gateway-inbox.jsonl",
      outbox: "/tmp/gateway-outbox.jsonl",
      attachments: "/tmp/gateway-attachments.jsonl",
    },
    transportControl: controlPlane.totals,
    messagingBridge: controlPlane.messagingBridge,
    transportInventory: controlPlane.transportInventory,
  };

  const readModel = new GatewayRunnerReadModel({
    historyView,
    traceLog,
    inboxLog,
    outboxLog,
    attachmentLog,
    supervisionLog,
    getTransportControlPlane: () => controlPlane,
    buildDaemonRuntimeState: () =>
      state.daemon as GatewayRuntimeStatus["daemon"],
    getRuntimeMeta: () => ({
      pid: runtimeStatusMeta.pid,
      running: runtimeStatusMeta.running,
      updatedAt: runtimeStatusMeta.updatedAt,
      startedAt: runtimeStatusMeta.startedAt,
      stoppedAt: runtimeStatusMeta.stoppedAt,
      lastHeartbeatAt: runtimeStatusMeta.lastHeartbeatAt,
      lastWatchdogAt: runtimeStatusMeta.lastWatchdogAt,
      lastSupervisionAt: runtimeStatusMeta.lastSupervisionAt,
      adapterPlatforms: runtimeStatusMeta.adapters,
      journalPaths: runtimeStatusMeta.journalPaths,
    }),
    snapshotState: async (reason, limit, filters) => {
      snapshotCalls.push({ reason, limit, filters });
      return {
        updatedAt: state.updatedAt,
        reason,
        snapshotPath: state.snapshotPath,
        historyPath: state.historyPath,
        readiness,
        transportOverview: state.transportOverview,
        transportSummaries: state.transportSummaries,
        transportJournal: state.transportJournal,
        traces: traceLog,
        inbox: inboxLog,
        outbox: outboxLog,
        attachments: attachmentLog,
        deliveries: historyView.snapshotWindow(20).deliveries,
        sessions: historyView.snapshotWindow(20).sessions,
        state: {
          ...state,
          reason,
        },
      } as unknown as GatewayHistorySnapshot;
    },
    getConfiguredPlatforms: () => ["api"],
    getNativeMessagingState: () => undefined,
    receive: async (message) => {
      receivedMessages.push(message.metadata ?? {});
      return {
        ok: true,
        response: "replayed",
        traceId: "trace-replay",
        sessionId: "session-1",
        deliveryId: "delivery-2",
      };
    },
  });

  return { readModel, receivedMessages, runtimeStatusMeta, snapshotCalls };
}

describe("GatewayRunnerReadModel", () => {
  it("builds runtime status and transport inspection views from the read surface", async () => {
    const { readModel, runtimeStatusMeta, snapshotCalls } = buildReadModel();

    const runtimeStatus = readModel.runtimeStatus();
    const health = await readModel.health();
    const transport = await readModel.transport("api");
    const overview = await readModel.transportOverview();
    const stateSnapshot = await readModel.state(1, { platform: "api" });
    const historySnapshot = await readModel.history(2, {
      sessionId: "session-1",
    });
    const traces = readModel.trace(1, { platform: "api" });
    const inbox = readModel.inbox(1, { platform: "api" });
    const outbox = readModel.outbox(1, { platform: "api" });
    const attachments = readModel.attachments(1, { platform: "api" });
    const supervision = readModel.supervision(1);

    expect(runtimeStatus).toMatchObject({
      pid: runtimeStatusMeta.pid,
      running: true,
      adapters: ["api"],
      supervisionEvents: 2,
    });
    expect(health[0]?.platform).toBe("api");
    expect(transport.platform).toBe("api");
    expect(transport.summary).toContain("api:");
    expect(transport.traceCount).toBe(2);
    expect(transport.inboxCount).toBe(1);
    expect(transport.outboxCount).toBe(1);
    expect(transport.attachmentCount).toBe(1);
    expect(transport.mismatchFlags).toContain("inventory-operational-mismatch");
    expect(transport.mismatchFlags).toContain("health-ready-mismatch");
    expect(overview.operationalCount).toBe(1);
    expect(overview.mismatchCount).toBe(1);
    expect(overview.details[0]?.platform).toBe("api");
    expect(stateSnapshot.platforms[0]?.platform).toBe("api");
    expect(historySnapshot.state.reason).toBe("history");
    expect(traces[0]?.traceId).toBe("trace-2");
    expect(inbox[0]?.recordId).toBe("inbox-1");
    expect(outbox[0]?.recordId).toBe("outbox-1");
    expect(attachments[0]?.attachmentId).toBe("attachment-1");
    expect(supervision[0]?.action).toBe("recover");
    expect(
      snapshotCalls.some(
        (call) =>
          call.reason === "history" &&
          call.limit === 100 &&
          call.filters?.platform === "api",
      ),
    ).toBe(true);
    expect(
      snapshotCalls.some(
        (call) =>
          call.reason === "history" &&
          call.limit === 1 &&
          call.filters?.platform === "api",
      ),
    ).toBe(true);
    expect(
      snapshotCalls.some(
        (call) =>
          call.reason === "history" &&
          call.limit === 2 &&
          call.filters?.sessionId === "session-1",
      ),
    ).toBe(true);
    expect(
      snapshotCalls.some(
        (call) => call.reason === "health" && call.limit === 20,
      ),
    ).toBe(true);
  });

  it("replays inbox records through the extracted read seam", async () => {
    const { readModel, receivedMessages } = buildReadModel();

    const replay = await readModel.replayInbox("inbox-1");

    expect(replay.ok).toBe(true);
    expect(replay.traceId).toBe("trace-replay");
    expect(replay.transportDetail?.platform).toBe("api");
    expect(replay.transportSummary).toContain("api:");
    expect(replay.transportSummary).toContain("ready=");
    expect(receivedMessages[0]?.replayedFromRecordId).toBe("inbox-1");
    expect(receivedMessages[0]?.replayedAt).toBeDefined();
  });
});
