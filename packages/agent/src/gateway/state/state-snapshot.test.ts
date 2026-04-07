import { describe, expect, it } from "bun:test";
import type { DeliveredMessageRecord, SessionRoute } from "@/types/gateway";
import type { GatewayDaemonRuntimeState } from "../daemon-state";
import type { PlatformHealth } from "../platforms/base";
import {
  buildGatewayStateSnapshot,
  buildGatewayTransportDetail,
  type GatewayControlPlaneView,
  type GatewayNativeMessagingStateView,
  type GatewayPlatformStateView,
} from "./state-snapshot";

describe("gateway state snapshot helpers", () => {
  it("keeps recent transport drilldowns and full snapshot counts separate", () => {
    const controlPlane = {
      totals: {
        gatewayEnabled: 1,
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
    const platformState = {
      platform: "api" as const,
      nativePluginId: "native.api",
      nativePluginSource: "official" as const,
      nativePluginEnabled: true,
      nativePluginNotes: "ready",
      status: "running" as const,
      mode: "native" as const,
      ready: false,
      transportState: "degraded" as const,
      detail: "api transport ready",
      presence: {
        status: "offline" as const,
        activity: "api transport idle",
      },
      sendCount: 0,
      receiveCount: 0,
      routeCount: 0,
      respondCount: 0,
      heartbeatCount: 0,
      authorizeCount: 0,
      rejectCount: 0,
      restartCount: 2,
      restartFailureCount: 1,
      inboxCount: 2,
      outboxCount: 1,
      attachmentCount: 1,
      eventCount: 1,
      traceCount: 2,
      lastUpdatedAt: "2026-03-29T10:03:00.000Z",
      lastTraceAt: "2026-03-29T10:02:00.000Z",
      lastTraceKind: "deliver" as const,
      lastTraceDetail: "latest deliver",
      lastInboundAt: "2026-03-29T10:01:00.000Z",
      lastOutboundAt: "2026-03-29T10:02:00.000Z",
      lastDeliveryAt: "2026-03-29T10:02:00.000Z",
      lastDeliveryId: "d-1",
      lastSessionId: "session-1",
      lastRoomId: "room-1",
      lastUserId: "user-1",
      lastAttachmentAt: "2026-03-29T10:01:30.000Z",
      lastAttachmentKind: "image",
    } as unknown as GatewayPlatformStateView;
    const readiness = [
      {
        platform: "api" as const,
        status: "running" as const,
        mode: "native" as const,
        ready: true,
        detail: "api ready",
        events: [
          {
            at: "2026-03-29T10:03:00.000Z",
            kind: "heartbeat" as const,
            detail: "api heartbeat",
          },
        ],
        presence: {
          status: "online" as const,
          activity: "api active",
          lastPresenceChangeAt: "2026-03-29T10:03:00.000Z",
        },
        sendCount: 0,
        lastHeartbeatAt: "2026-03-29T10:03:00.000Z",
      },
    ] as unknown as PlatformHealth[];
    const traces = [
      {
        traceId: "t-1",
        at: "2026-03-29T10:01:00.000Z",
        kind: "receive" as const,
        platform: "api" as const,
        detail: "first",
        userId: "user-1",
        roomId: "room-1",
      },
      {
        traceId: "t-2",
        at: "2026-03-29T10:02:00.000Z",
        kind: "deliver" as const,
        platform: "api" as const,
        detail: "second",
        userId: "user-1",
        roomId: "room-1",
        deliveryId: "d-1",
      },
    ];
    const inbox = [
      {
        recordId: "i-1",
        at: "2026-03-29T10:01:00.000Z",
        platform: "api" as const,
        traceId: "t-1",
        status: "accepted" as const,
        userId: "user-1",
        roomId: "room-1",
        textPreview: "hello",
        attachmentCount: 1,
        attachmentKinds: ["image"],
        attachmentNames: ["snapshot"],
        attachmentUrls: ["https://example.com/snapshot.png"],
        attachmentMimeTypes: ["image/png"],
        metadataKeys: [],
        metadata: {},
      },
      {
        recordId: "i-2",
        at: "2026-03-29T10:02:00.000Z",
        platform: "api" as const,
        traceId: "t-2",
        status: "accepted" as const,
        userId: "user-1",
        roomId: "room-1",
        textPreview: "world",
        attachmentCount: 0,
        attachmentKinds: [],
        attachmentNames: [],
        attachmentUrls: [],
        attachmentMimeTypes: [],
        metadataKeys: [],
        metadata: {},
      },
    ];
    const outbox = [
      {
        recordId: "o-1",
        at: "2026-03-29T10:02:00.000Z",
        platform: "api" as const,
        traceId: "t-2",
        status: "sent" as const,
        deliveryId: "d-1",
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
    const attachments = [
      {
        attachmentId: "a-1",
        recordId: "i-1",
        at: "2026-03-29T10:01:30.000Z",
        direction: "inbox" as const,
        platform: "api" as const,
        traceId: "t-1",
        kind: "image",
        roomId: "room-1",
        metadataKeys: [],
        metadata: {},
        userId: "user-1",
      },
    ];
    const deliveries: DeliveredMessageRecord[] = [
      {
        id: "d-1",
        target: {
          platform: "api" as const,
          channelId: "room-1",
          userId: "user-1",
          mode: "explicit" as const,
        },
        text: "reply",
        createdAt: "2026-03-29T10:02:00.000Z",
      },
    ];
    const sessions: SessionRoute[] = [
      {
        sessionKey: "session-1",
        platform: "api" as const,
        roomId: "room-1",
        userId: "user-1",
        updatedAt: "2026-03-29T10:03:00.000Z",
        isHome: true,
      } as SessionRoute,
    ];

    const drilldown = buildGatewayTransportDetail({
      platform: "api",
      controlPlane,
      platformState,
      readiness: readiness[0],
      traces,
      inbox,
      outbox,
      attachments,
      nativeMessagingState: {
        ready: true,
        summary: "native bridge ready",
        detail: "bridge online",
      } as unknown as GatewayNativeMessagingStateView,
      recentLimit: 1,
      countFromRecent: true,
      includeHealthMismatch: true,
    });
    const snapshot = buildGatewayStateSnapshot({
      running: true,
      reason: "health",
      snapshotPath: "/tmp/gateway-state.json",
      historyPath: "/tmp/gateway-state-history.jsonl",
      daemon: {
        heartbeatRuns: 1,
        watchdogRuns: 1,
        restartRuns: 2,
        restartRecoveries: 1,
        restartBackoffs: 0,
        watchdogSkips: 0,
        lastHeartbeatAt: "2026-03-29T10:03:00.000Z",
        lastWatchdogAt: "2026-03-29T10:04:00.000Z",
        lastRestartAt: "2026-03-29T10:00:00.000Z",
        lastRecoveryAt: "2026-03-29T10:01:00.000Z",
        lastBackoffAt: undefined,
        lastReason: "health",
      } as unknown as GatewayDaemonRuntimeState,
      controlPlane,
      readiness,
      platformStates: new Map([["api", platformState]]),
      allTraces: traces,
      traces: traces.slice(-1),
      inbox: inbox.slice(-1),
      outbox,
      attachments,
      deliveries,
      sessions,
      heartbeatAt: "2026-03-29T10:03:00.000Z",
      watchdogAt: "2026-03-29T10:04:00.000Z",
      now: "2026-03-29T10:05:00.000Z",
    });

    expect(drilldown.traceCount).toBe(1);
    expect(drilldown.recentTraces).toHaveLength(1);
    expect(drilldown.recentTraces[0]?.traceId).toBe("t-2");
    expect(drilldown.mismatchFlags).toEqual(
      expect.arrayContaining([
        "gateway-enabled-without-ready-platform",
        "inventory-operational-mismatch",
        "health-ready-mismatch",
      ]),
    );
    expect(drilldown.summary).toContain("native=native bridge ready");
    expect(snapshot.updatedAt).toBe("2026-03-29T10:05:00.000Z");
    expect(snapshot.totals.totalTraces).toBe(2);
    expect(snapshot.totals.recentTraces).toBe(1);
    expect(snapshot.transportOverview.mismatchCount).toBe(1);
    expect(snapshot.transportOverview.details[0]?.traceCount).toBe(2);
    expect(snapshot.transportOverview.details[0]?.recentTraces).toHaveLength(2);
    expect(snapshot.platforms[0]?.lastInboundAt).toBe(
      "2026-03-29T10:02:00.000Z",
    );
    expect(snapshot.transportSummaries[0]?.detail).toBe(
      "api transport operational",
    );
    expect(snapshot.transportJournal[0]?.summary).toContain(
      "api: source=official",
    );
    expect(snapshot.transportJournal[0]?.summary).toContain("mismatches=");
  });
});
