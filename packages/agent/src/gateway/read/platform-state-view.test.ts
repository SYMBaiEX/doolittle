import { describe, expect, it } from "bun:test";
import type { PlatformCapabilitySet, PlatformHealth } from "../platforms/base";
import {
  buildPlatformStateFromSnapshot,
  createGatewayPlatformStateView,
} from "./platform-state-view";

const capabilities: PlatformCapabilitySet = {
  inbound: true,
  outbound: true,
  edits: false,
  pairing: false,
  attachments: true,
  replies: true,
  threads: false,
  metadata: true,
};

describe("gateway platform state view", () => {
  it("creates a stable default state", () => {
    const state = createGatewayPlatformStateView("api");

    expect(state).toEqual(
      expect.objectContaining({
        platform: "api",
        status: "stopped",
        mode: "mock",
        ready: false,
        transportState: "inactive",
        detail: "api transport has not been initialized yet.",
        presence: {
          status: "offline",
          activity: "api transport idle",
        },
        sendCount: 0,
        receiveCount: 0,
        routeCount: 0,
        respondCount: 0,
        heartbeatCount: 0,
        authorizeCount: 0,
        rejectCount: 0,
      }),
    );
  });

  it("projects snapshot state, latest activity, and counters", () => {
    const platformState = createGatewayPlatformStateView("api");
    platformState.receiveCount = 7;
    platformState.routeCount = 2;
    platformState.respondCount = 4;
    platformState.heartbeatCount = 1;
    platformState.authorizeCount = 3;
    platformState.rejectCount = 2;
    platformState.lastInboundAt = "2026-04-01T10:00:00.000Z";
    platformState.lastSessionId = "session-old";
    platformState.lastUpdatedAt = "2026-04-01T10:00:00.000Z";

    const readiness: PlatformHealth = {
      platform: "api",
      status: "running",
      mode: "native",
      ready: true,
      capabilities,
      detail: "api transport healthy",
      events: [
        {
          at: "2026-04-01T10:07:00.000Z",
          kind: "heartbeat",
          detail: "heartbeat",
        },
      ],
      presence: {
        status: "online",
        activity: "api traffic normal",
      },
      sendCount: 99,
      lastDeliveryAt: "2026-04-01T10:06:00.000Z",
      lastDeliveryId: "delivery-api-1",
      lastOutboundRoomId: "room-1",
      lastOutboundUserId: "user-1",
      lastOutboundThreadId: "thread-1",
      lastOutboundReplyToId: "reply-1",
      lastOutboundMetadataKeys: ["channel", "intent"],
      lastReceivedAt: "2026-04-01T10:05:00.000Z",
      lastRoutedAt: "2026-04-01T10:05:30.000Z",
      lastRespondedAt: "2026-04-01T10:06:20.000Z",
      lastHeartbeatAt: "2026-04-01T10:07:00.000Z",
    } satisfies PlatformHealth;

    const view = buildPlatformStateFromSnapshot({
      platform: "api",
      readiness,
      platformState,
      allTraces: [
        {
          traceId: "t1",
          at: "2026-04-01T10:01:00.000Z",
          kind: "receive",
          platform: "api",
          detail: "inbound",
        },
        {
          traceId: "t2",
          at: "2026-04-01T10:03:00.000Z",
          kind: "deliver",
          platform: "api",
          detail: "delivered",
        },
      ],
      inbox: [
        {
          recordId: "i1",
          at: "2026-04-01T10:02:00.000Z",
          platform: "api",
          traceId: "t1",
          status: "accepted",
          userId: "u",
          roomId: "r",
          textPreview: "received",
          attachmentCount: 1,
          attachmentKinds: ["image"],
          attachmentNames: ["photo"],
          attachmentUrls: ["https://example.com/p.png"],
          attachmentMimeTypes: ["image/png"],
          metadataKeys: [],
          metadata: {},
        },
        {
          recordId: "i2",
          at: "2026-04-01T10:04:00.000Z",
          platform: "api",
          traceId: "t2",
          status: "accepted",
          userId: "u",
          roomId: "r",
          textPreview: "received 2",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
      ],
      outbox: [
        {
          recordId: "o1",
          at: "2026-04-01T10:03:00.000Z",
          platform: "api",
          traceId: "t2",
          status: "sent",
          userId: "u",
          roomId: "r",
          textPreview: "reply",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
      ],
      attachments: [
        {
          attachmentId: "a1",
          recordId: "i1",
          at: "2026-04-01T10:02:15.000Z",
          direction: "inbox",
          platform: "api",
          traceId: "t1",
          kind: "image",
          roomId: "r",
          metadataKeys: [],
          metadata: {},
          userId: "u",
          name: "photo",
          url: "https://example.com/p.png",
          mimeType: "image/png",
        },
      ],
      now: "2026-04-01T10:10:00.000Z",
    });

    expect(view.platform).toBe("api");
    expect(view.status).toBe("running");
    expect(view.mode).toBe("native");
    expect(view.ready).toBe(true);
    expect(view.detail).toBe("api transport healthy");
    expect(view.presence).toMatchObject({
      status: "online",
      activity: "api traffic normal",
    });
    expect(view.sendCount).toBe(99);
    expect(view.receiveCount).toBe(7);
    expect(view.routeCount).toBe(2);
    expect(view.respondCount).toBe(4);
    expect(view.heartbeatCount).toBe(1);
    expect(view.authorizeCount).toBe(3);
    expect(view.rejectCount).toBe(2);
    expect(view.inboxCount).toBe(2);
    expect(view.outboxCount).toBe(1);
    expect(view.attachmentCount).toBe(1);
    expect(view.traceCount).toBe(2);
    expect(view.lastDeliveryAt).toBe("2026-04-01T10:06:00.000Z");
    expect(view.lastOutboundAt).toBe("2026-04-01T10:03:00.000Z");
    expect(view.lastInboundAt).toBe("2026-04-01T10:04:00.000Z");
    expect(view.lastEventAt).toBe("2026-04-01T10:07:00.000Z");
    expect(view.lastTraceAt).toBe("2026-04-01T10:03:00.000Z");
    expect(view.lastTraceKind).toBe("deliver");
    expect(view.lastTraceDetail).toBe("delivered");
    expect(view.lastAttachmentAt).toBe("2026-04-01T10:02:15.000Z");
    expect(view.lastAttachmentKind).toBe("image");
    expect(view.lastOutboundMetadataKeys).toEqual(["channel", "intent"]);
    expect(view.lastSessionId).toBe("session-old");
    expect(view.lastUpdatedAt).toBe("2026-04-01T10:00:00.000Z");
  });

  it("falls back to platform state for presence and activity timestamps when readiness lacks data", () => {
    const platformState = createGatewayPlatformStateView("signal");
    platformState.lastReceivedAt = "2026-04-01T09:59:00.000Z";
    platformState.lastUpdatedAt = undefined;
    platformState.lastTraceAt = undefined;
    platformState.lastEventAt = undefined;
    platformState.inboxCount = 2;
    platformState.outboxCount = 3;
    platformState.attachmentCount = 4;

    const readiness: PlatformHealth = {
      platform: "signal",
      status: "stopped",
      mode: "mock",
      ready: false,
      capabilities,
      detail: "signal degraded",
      events: [],
    } satisfies PlatformHealth;

    const view = buildPlatformStateFromSnapshot({
      platform: "signal",
      readiness,
      platformState,
      allTraces: [
        {
          traceId: "s1",
          at: "2026-04-01T09:58:00.000Z",
          kind: "receive",
          platform: "signal",
          detail: "signal receive",
        },
      ],
      inbox: [],
      outbox: [],
      attachments: [],
      now: "2026-04-01T10:10:00.000Z",
    });

    expect(view.presence).toEqual({
      status: "offline",
      activity: "signal transport idle",
    });
    expect(view.lastInboundAt).toBe("2026-04-01T09:59:00.000Z");
    expect(view.lastUpdatedAt).toBe("2026-04-01T10:10:00.000Z");
    expect(view.inboxCount).toBe(0);
    expect(view.outboxCount).toBe(0);
    expect(view.attachmentCount).toBe(0);
    expect(view.sendCount).toBe(0);
    expect(view.lastTraceAt).toBe("2026-04-01T09:58:00.000Z");
    expect(view.lastEventAt).toBeUndefined();
  });
});
