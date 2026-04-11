import { describe, expect, it } from "bun:test";
import type { PlatformHealth } from "../platforms/base";
import {
  applyGatewayHealthToPlatformState,
  buildGatewayPlatformPresence,
  computeGatewayTransportState,
  createGatewayPlatformState,
} from "./platform-state";

describe("gateway platform state helpers", () => {
  it("creates initial platform state with native plugin metadata", () => {
    const state = createGatewayPlatformState("telegram", {
      id: "plugin-telegram",
      source: "official",
      enabled: true,
      notes: "native bridge",
    });

    expect(state.platform).toBe("telegram");
    expect(state.nativePluginId).toBe("plugin-telegram");
    expect(state.nativePluginSource).toBe("official");
    expect(state.nativePluginEnabled).toBe(true);
    expect(state.nativePluginNotes).toBe("native bridge");
    expect(state.transportState).toBe("inactive");
    expect(state.detail).toBe(
      "telegram transport has not been initialized yet.",
    );
    expect(state.presence).toEqual({
      status: "offline",
      activity: "telegram transport idle",
    });
    expect(state.traceCount).toBe(0);
    expect(state.eventCount).toBe(0);
  });

  it("computes transport state across running, idle, and stopped modes", () => {
    expect(computeGatewayTransportState("api", "running", true)).toBe("live");
    expect(computeGatewayTransportState("api", "running", false)).toBe(
      "degraded",
    );
    expect(computeGatewayTransportState("signal", "idle", false)).toBe(
      "booting",
    );
    expect(computeGatewayTransportState("api", "stopped", true)).toBe("paused");
    expect(computeGatewayTransportState("api", "stopped", false)).toBe(
      "inactive",
    );
  });

  it("applies health updates while preserving prior optional state", () => {
    const state = createGatewayPlatformState("matrix");
    state.sendCount = 2;
    state.lastDeliveryId = "delivery-before";
    state.lastOutboundRoomId = "room-before";
    state.lastOutboundUserId = "user-before";
    state.lastOutboundThreadId = "thread-before";
    state.lastOutboundReplyToId = "reply-before";
    state.lastOutboundMetadataKeys = ["old-key"];
    state.lastReceivedAt = "2026-03-28T00:00:00.000Z";
    state.lastRoutedAt = "2026-03-27T00:00:00.000Z";
    state.lastRespondedAt = "2026-03-26T00:00:00.000Z";
    state.lastHeartbeatAt = "2026-03-25T00:00:00.000Z";

    const presence = buildGatewayPlatformPresence(
      "online",
      "adapter warm",
      () => "2026-03-30T00:00:01.000Z",
      "2026-03-25T00:00:00.000Z",
    );
    const health: PlatformHealth = {
      platform: "matrix",
      status: "running",
      ready: false,
      mode: "native",
      capabilities: {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: false,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      },
      detail: "matrix adapter degraded",
      events: [
        {
          at: "2026-03-30T00:00:00.000Z",
          kind: "heartbeat",
          detail: "heartbeat recorded",
        },
      ],
      presence,
    };

    applyGatewayHealthToPlatformState({
      state,
      health,
      nativePlugin: {
        id: "plugin-matrix",
        source: "vendored",
        enabled: true,
      },
      nowIso: () => "2026-03-30T00:00:02.000Z",
    });

    expect(state.nativePluginId).toBe("plugin-matrix");
    expect(state.nativePluginSource).toBe("vendored");
    expect(state.nativePluginEnabled).toBe(true);
    expect(state.status).toBe("running");
    expect(state.mode).toBe("native");
    expect(state.ready).toBe(false);
    expect(state.transportState).toBe("degraded");
    expect(state.detail).toBe("matrix adapter degraded");
    expect(state.sendCount).toBe(2);
    expect(state.lastDeliveryId).toBe("delivery-before");
    expect(state.lastOutboundRoomId).toBe("room-before");
    expect(state.lastOutboundUserId).toBe("user-before");
    expect(state.lastOutboundThreadId).toBe("thread-before");
    expect(state.lastOutboundReplyToId).toBe("reply-before");
    expect(state.lastOutboundMetadataKeys).toEqual(["old-key"]);
    expect(state.lastReceivedAt).toBe("2026-03-28T00:00:00.000Z");
    expect(state.lastRoutedAt).toBe("2026-03-27T00:00:00.000Z");
    expect(state.lastRespondedAt).toBe("2026-03-26T00:00:00.000Z");
    expect(state.lastHeartbeatAt).toBe("2026-03-25T00:00:00.000Z");
    expect(state.eventCount).toBe(1);
    expect(state.lastEventAt).toBe("2026-03-30T00:00:00.000Z");
    expect(state.lastEventKind).toBe("heartbeat");
    expect(state.lastEventDetail).toBe("heartbeat recorded");
    expect(state.lastUpdatedAt).toBe("2026-03-30T00:00:02.000Z");
    expect(state.presence).toEqual({
      status: "online",
      activity: "adapter warm",
      lastHeartbeatAt: "2026-03-25T00:00:00.000Z",
      lastPresenceChangeAt: "2026-03-30T00:00:01.000Z",
    });
  });
});
