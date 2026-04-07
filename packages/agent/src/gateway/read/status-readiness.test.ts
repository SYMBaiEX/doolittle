import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import { capabilitiesForPlatform } from "../platforms/base";
import {
  collectGatewayReadiness,
  mergePlatformHealthState,
} from "./status-readiness";

describe("gateway status readiness", () => {
  it("collects active adapter health and inactive configured platforms with status intent", async () => {
    const sync: Array<{ phase: "sync" | "merge"; detail: string }> = [];
    const configuredPlatforms: PlatformName[] = ["telegram", "signal", "api"];
    const readiness = await collectGatewayReadiness({
      configuredPlatforms,
      getAdapterPlatforms: () => new Set<PlatformName>(["telegram"]).values(),
      getAdapterHealth: async (platform) => {
        if (platform === "telegram") {
          return {
            platform,
            status: "running",
            ready: true,
            mode: "native",
            capabilities: capabilitiesForPlatform(platform),
            detail: "telegram adapter healthy",
            events: [],
          };
        }
        throw new Error(`unexpected ${platform}`);
      },
      isPlatformEnabled: (platform) => platform !== "api",
      syncPlatformStateFromHealth: (health) => {
        sync.push({ phase: "sync", detail: health.platform });
      },
      mergePlatformHealth: (health) => {
        sync.push({ phase: "merge", detail: health.platform });
        return {
          ...health,
          detail:
            health.platform === "telegram"
              ? "merged telegram"
              : `merged inactive:${health.detail}`,
        };
      },
    });

    expect(readiness).toHaveLength(3);
    expect(readiness.map((entry) => entry.platform)).toEqual([
      "telegram",
      "signal",
      "api",
    ]);
    expect(readiness[0]).toEqual(
      expect.objectContaining({
        platform: "telegram",
        status: "running",
        ready: true,
        detail: "merged telegram",
      }),
    );
    expect(readiness[1]).toMatchObject({
      platform: "signal",
      status: "stopped",
      ready: false,
      mode: "native",
      detail:
        "merged inactive:Lightweight webhook-normalized support is active for signal; inbound, outbound, replies are routed through shared session and delivery history.",
      presence: {
        status: "offline",
        activity: "signal transport is inactive",
      },
    });
    expect(readiness[1].events[0]).toMatchObject({
      kind: "health",
    });
    expect(readiness[2]).toMatchObject({
      platform: "api",
      status: "stopped",
      ready: false,
      mode: "mock",
      detail: "merged inactive:Platform is disabled in gateway configuration.",
    });
    expect(readiness[2]).toMatchObject({
      presence: {
        status: "offline",
        activity: "api transport is inactive",
      },
    });
    expect(sync).toEqual([
      { phase: "sync", detail: "telegram" },
      { phase: "merge", detail: "telegram" },
      { phase: "sync", detail: "signal" },
      { phase: "merge", detail: "signal" },
      { phase: "sync", detail: "api" },
      { phase: "merge", detail: "api" },
    ]);
  });

  it("merges platform health with transport inventory and state fallbacks", () => {
    const merged = mergePlatformHealthState({
      health: {
        platform: "matrix",
        status: "running",
        ready: true,
        mode: "native",
        capabilities: capabilitiesForPlatform("matrix"),
        detail: "raw detail",
        events: [
          {
            at: "2026-03-30T00:00:00.000Z",
            kind: "heartbeat",
            detail: "adapter started",
          },
        ],
      },
      getPlatformState: () => ({
        lastUpdatedAt: "2026-03-30T00:00:00.000Z",
        lastDeliveryAt: "2026-03-29T00:00:00.000Z",
        lastDeliveryId: "delivery-before",
        lastOutboundRoomId: "room-before",
        lastOutboundUserId: "user-before",
        lastOutboundThreadId: "thread-before",
        lastOutboundReplyToId: "reply-before",
        lastOutboundMetadataKeys: ["old-key"],
        lastReceivedAt: "2026-03-28T00:00:00.000Z",
        lastRoutedAt: "2026-03-27T00:00:00.000Z",
        lastRespondedAt: "2026-03-26T00:00:00.000Z",
        lastHeartbeatAt: "2026-03-25T00:00:00.000Z",
        sendCount: 2,
        events: [
          {
            at: "2026-03-30T00:00:00.000Z",
            kind: "heartbeat",
            detail: "existing event",
          },
        ],
        presence: {
          status: "online",
          activity: "warm",
          lastPresenceChangeAt: "2026-03-24T00:00:00.000Z",
        },
      }),
      getTransportInventoryEntry: () => ({
        operational: false,
        detail: "bridge offline",
      }),
    });

    expect(merged.ready).toBe(false);
    expect(merged.detail).toBe("bridge offline raw detail");
    expect(merged.lastSendAt).toBe("2026-03-30T00:00:00.000Z");
    expect(merged.lastDeliveryAt).toBe("2026-03-29T00:00:00.000Z");
    expect(merged.lastDeliveryId).toBe("delivery-before");
    expect(merged.lastOutboundRoomId).toBe("room-before");
    expect(merged.lastOutboundUserId).toBe("user-before");
    expect(merged.lastOutboundThreadId).toBe("thread-before");
    expect(merged.lastOutboundReplyToId).toBe("reply-before");
    expect(merged.lastOutboundMetadataKeys).toEqual(["old-key"]);
    expect(merged.lastReceivedAt).toBe("2026-03-28T00:00:00.000Z");
    expect(merged.lastRoutedAt).toBe("2026-03-27T00:00:00.000Z");
    expect(merged.lastRespondedAt).toBe("2026-03-26T00:00:00.000Z");
    expect(merged.lastHeartbeatAt).toBe("2026-03-25T00:00:00.000Z");
    expect(merged.sendCount).toBe(2);
    expect(merged.lastError).toBe("bridge offline");
    expect(merged.presence).toEqual({
      status: "online",
      activity: "warm",
      lastPresenceChangeAt: "2026-03-24T00:00:00.000Z",
    });
  });

  it("keeps explicit health lastError over inferred error and ignores custom-ready reason", () => {
    const merged = mergePlatformHealthState({
      health: {
        platform: "signal",
        status: "running",
        ready: false,
        mode: "native",
        capabilities: capabilitiesForPlatform("signal"),
        detail: "signal raw detail",
        lastError: "explicit adapter error",
        events: [],
      },
      getPlatformState: () => ({}),
      getTransportInventoryEntry: () => ({
        operational: false,
        detail: "ignored",
        reason: "custom-ready",
      }),
    });

    expect(merged.ready).toBe(false);
    expect(merged.lastError).toBe("explicit adapter error");
  });
});
