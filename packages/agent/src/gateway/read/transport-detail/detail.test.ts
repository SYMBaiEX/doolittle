import { describe, expect, it } from "bun:test";
import type {
  PlatformCapabilitySet,
  PlatformHealth,
} from "../../platforms/base";
import { createGatewayPlatformStateView } from "../platform-state-view";
import { buildGatewayTransportDetail } from "./detail";

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

describe("gateway transport detail", () => {
  it("flags readiness mismatch in degraded transport summaries", () => {
    const platformState = createGatewayPlatformStateView("api");
    platformState.ready = false;
    platformState.transportState = "degraded";
    platformState.restartCount = 2;
    platformState.restartFailureCount = 1;
    platformState.nextRestartAt = "2026-04-01T10:15:00.000Z";

    const readiness: PlatformHealth = {
      platform: "api",
      status: "running",
      mode: "native",
      ready: true,
      capabilities,
      detail: "api is healthy",
      events: [],
      presence: {
        status: "online",
        activity: "api online",
      },
    } satisfies PlatformHealth;

    const detail = buildGatewayTransportDetail({
      platform: "api",
      controlPlane: {
        totals: {
          configured: 1,
          gatewayEnabled: 1,
          operationalTransports: 1,
        },
        transportInventory: [
          {
            platform: "api",
            source: "official",
            configEnabled: true,
            gatewayEnabled: true,
            operational: false,
            detail: "api operational mismatch",
          },
        ],
        messagingBridge: [
          {
            platform: "api",
            pluginId: "native.api",
            pluginSource: "official",
            pluginEnabled: true,
            serviceAvailable: false,
            live: true,
            detail: "bridge present",
          },
        ],
      } as never,
      platformState,
      readiness,
      traces: [
        {
          traceId: "t1",
          at: "2026-04-01T09:58:00.000Z",
          kind: "receive",
          platform: "api",
          detail: "old 1",
        },
        {
          traceId: "t2",
          at: "2026-04-01T09:59:00.000Z",
          kind: "deliver",
          platform: "api",
          detail: "old 2",
        },
        {
          traceId: "t3",
          at: "2026-04-01T10:00:00.000Z",
          kind: "heartbeat",
          platform: "api",
          detail: "old 3",
        },
      ],
      inbox: [
        {
          recordId: "i1",
          at: "2026-04-01T09:56:00.000Z",
          platform: "api",
          traceId: "t1",
          status: "accepted",
          userId: "u",
          roomId: "r",
          textPreview: "a",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
        {
          recordId: "i2",
          at: "2026-04-01T09:59:30.000Z",
          platform: "api",
          traceId: "t2",
          status: "accepted",
          userId: "u",
          roomId: "r",
          textPreview: "b",
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
          at: "2026-04-01T09:58:30.000Z",
          platform: "api",
          traceId: "t1",
          status: "sent",
          deliveryId: "d1",
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
        {
          recordId: "o2",
          at: "2026-04-01T10:00:30.000Z",
          platform: "api",
          traceId: "t3",
          status: "sent",
          deliveryId: "d2",
          userId: "u",
          roomId: "r",
          textPreview: "follow-up",
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
          attachmentId: "att1",
          recordId: "i2",
          at: "2026-04-01T09:59:40.000Z",
          direction: "inbox",
          platform: "api",
          traceId: "t2",
          kind: "image",
          roomId: "r",
          name: "photo",
          url: "https://example.com/photo.png",
          mimeType: "image/png",
          metadataKeys: [],
          metadata: {},
          userId: "u",
        },
      ],
      nativeMessagingState: {
        ready: false,
        summary: "bridge starting",
        detail: "bridge unavailable",
      } as never,
      recentLimit: 2,
      includeHealthMismatch: true,
      countFromRecent: true,
    });

    expect(detail.platform).toBe("api");
    expect(detail.platformState?.ready).toBe(false);
    expect(detail.readiness?.ready).toBe(true);
    expect(detail.nativeMessagingState?.ready).toBe(false);
    expect(detail.traceCount).toBe(2);
    expect(detail.inboxCount).toBe(2);
    expect(detail.outboxCount).toBe(2);
    expect(detail.attachmentCount).toBe(1);
    expect(detail.mismatchFlags).toEqual([
      "gateway-enabled-without-ready-platform",
      "plugin-enabled-without-runtime-service",
      "health-ready-mismatch",
    ]);
    expect(detail.summary).toContain("source=official");
    expect(detail.summary).toContain("operational=false");
    expect(detail.summary).toContain("ready=false");
    expect(detail.summary).toContain("restarts=2");
    expect(detail.summary).toContain("failures=1");
    expect(detail.summary).toContain("native=bridge starting");
    expect(detail.summary).toContain("health-ready-mismatch");
  });

  it("uses fresh defaults when platform state is missing and no readiness is available", () => {
    const detail = buildGatewayTransportDetail({
      platform: "homeassistant",
      controlPlane: {
        totals: {
          configured: 1,
          gatewayEnabled: 1,
          operationalTransports: 0,
        },
        transportInventory: [
          {
            platform: "homeassistant",
            source: "vendored",
            configEnabled: true,
            gatewayEnabled: true,
            operational: true,
            detail: "homeassistant config present",
          },
        ],
        messagingBridge: [],
      } as never,
      traces: [],
      inbox: [],
      outbox: [],
      attachments: [],
      recentLimit: 5,
      countFromRecent: false,
    });

    expect(detail.platform).toBe("homeassistant");
    expect(detail.platformState?.platform).toBe("homeassistant");
    expect(detail.platformState?.ready).toBe(false);
    expect(detail.readiness).toBeUndefined();
    expect(detail.summary).toContain(
      "mismatches=gateway-enabled-without-ready-platform",
    );
    expect(detail.summary).toContain("source=vendored");
    expect(detail.traceCount).toBe(0);
    expect(detail.inventory?.platform).toBe("homeassistant");
    expect(detail.messagingBridge).toBeUndefined();
  });
});
