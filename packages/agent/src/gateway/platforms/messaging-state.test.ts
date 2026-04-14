import { describe, expect, it } from "bun:test";
import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types/gateway";
import { MessagingPlatformState } from "./messaging-state";
import { createDeliveryRoot } from "./test-helpers";

function createRecord(delivery: DeliveryService) {
  return delivery.deliver(
    {
      platform: "telegram",
      channelId: "room-1",
      userId: "user-1",
      mode: "explicit",
    },
    "baseline",
    { metadata: { source: "test" } },
  );
}

const nativeBridge: NativeMessagingTransportState = {
  platform: "telegram",
  pluginId: "telegram-native",
  pluginSource: "official" as const,
  configEnabled: true,
  pluginEnabled: true,
  gatewayEnabled: true,
  serviceName: "telegram",
  serviceAvailable: true,
  live: true,
  reason: "live",
  detail: "service live",
  ready: true,
  summary: "Telegram native plugin ready",
};

describe("MessagingPlatformState", () => {
  it("tracks delivery state and builds ready health when running", async () => {
    const { delivery, cleanup } = createDeliveryRoot("messaging-state");
    const state = new MessagingPlatformState("telegram");
    state.start({
      configured: true,
      startedDetail: "messaging started",
      missingDetail: "missing config",
    });

    const message: OutboundPlatformMessage = {
      roomId: "room-1",
      userId: "user-1",
      text: "hello",
    };

    const record = createRecord(delivery);
    state.recordDelivery({
      kind: "deliver",
      detail: "delivery recorded",
      message,
      record,
    });

    const health = state.health({
      configured: true,
      canReceive: true,
      configuredDetail: "configured",
      missingDetail: "missing config",
      runningDetail: "running",
      stoppedDetail: "stopped",
      bridge: nativeBridge,
    });

    expect(health.platform).toBe("telegram");
    expect(health.ready).toBe(true);
    expect(health.lastDeliveryId).toBe(record.id);
    expect(health.lastOutboundRoomId).toBe("room-1");
    expect(health.nativePluginNotes).toBe(
      `${nativeBridge.summary}; ${nativeBridge.detail}`,
    );
    expect(state.getSendCount()).toBe(1);
    cleanup();
  });

  it("records error events as last error in health output", () => {
    const { cleanup } = createDeliveryRoot("messaging-state-error");
    const state = new MessagingPlatformState("telegram");

    state.start({
      configured: false,
      startedDetail: "should not start",
      missingDetail: "not configured",
    });
    state.observe({
      at: "2024-01-01T00:00:00.000Z",
      kind: "error",
      detail: "send failed",
    });
    const health = state.health({
      configured: false,
      canReceive: false,
      configuredDetail: "configured",
      missingDetail: "not configured",
      runningDetail: "running",
      stoppedDetail: "stopped",
    });

    expect(health.ready).toBe(false);
    expect(health.lastError).toBe("send failed");
    expect(health.sendCount).toBe(0);
    cleanup();
  });

  it("throws and persists last error from fail()", () => {
    const { cleanup } = createDeliveryRoot("messaging-state-fail");
    const state = new MessagingPlatformState("whatsapp");

    state.start({
      configured: false,
      startedDetail: "should fail",
      missingDetail: "missing token",
    });
    state.stop("requested stop");

    expect(() => state.fail("manual failure")).toThrow(
      new Error("manual failure"),
    );

    const health = state.health({
      configured: false,
      canReceive: false,
      configuredDetail: "configured",
      missingDetail: "missing token",
      runningDetail: "running",
      stoppedDetail: "stopped",
    });

    expect(health.lastError).toBe("manual failure");
    cleanup();
  });

  it("honors canReceive and bridge readiness gates for readiness", () => {
    const state = new MessagingPlatformState("telegram");
    state.start({
      configured: true,
      startedDetail: "ready",
      missingDetail: "missing config",
    });

    const healthWithBridgeNotReady = state.health({
      configured: true,
      canReceive: true,
      configuredDetail: "configured",
      missingDetail: "missing config",
      runningDetail: "running",
      stoppedDetail: "stopped",
      bridge: { ...nativeBridge, ready: false },
    });

    expect(healthWithBridgeNotReady.ready).toBe(false);
    expect(healthWithBridgeNotReady.nativePluginEnabled).toBe(true);

    const healthWithNoBridge = state.health({
      configured: true,
      canReceive: true,
      configuredDetail: "configured",
      missingDetail: "missing config",
      runningDetail: "running",
      stoppedDetail: "stopped",
    });
    expect(healthWithNoBridge.ready).toBe(true);
  });
});
