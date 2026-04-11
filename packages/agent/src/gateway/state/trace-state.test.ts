import { describe, expect, it } from "bun:test";
import type { PlatformPresenceState } from "../platforms/base";
import type { GatewayTraceRecord } from "../read/history-view";
import {
  applyGatewayTraceToPlatformState,
  type GatewayTraceStateContext,
} from "./trace-state";

function makeTrace(overrides: Partial<GatewayTraceRecord>): GatewayTraceRecord {
  return {
    at: "2026-03-30T00:00:00.000Z",
    traceId: "trace-1",
    kind: "receive",
    platform: "api",
    detail: "baseline",
    ...overrides,
  };
}

function makeState(): GatewayTraceStateContext {
  return {
    status: "running",
    ready: true,
    traceCount: 0,
    lastTraceAt: undefined,
    lastTraceKind: undefined,
    lastTraceDetail: undefined,
    lastUpdatedAt: undefined,
    lastRoomId: undefined,
    lastUserId: undefined,
    lastSessionId: undefined,
    receiveCount: 0,
    authorizeCount: 0,
    routeCount: 0,
    respondCount: 0,
    heartbeatCount: 0,
    rejectCount: 0,
    lastReceivedAt: undefined,
    lastInboundAt: undefined,
    lastRoutedAt: undefined,
    lastRespondedAt: undefined,
    lastDeliveryAt: undefined,
    lastDeliveryId: undefined,
    lastOutboundAt: undefined,
    lastHeartbeatAt: undefined,
    transportState: "inactive",
    presence: {
      status: "offline",
      activity: "booting",
    },
  } satisfies GatewayTraceStateContext;
}

function createPresence(
  status: PlatformPresenceState["status"],
  activity: string,
  lastHeartbeatAt?: string,
): PlatformPresenceState {
  return {
    status,
    activity,
    lastHeartbeatAt,
    lastPresenceChangeAt: "2026-03-30T00:00:00.001Z",
  };
}

describe("gateway trace state projection", () => {
  it("records receive traces as live traffic with presence", () => {
    const state = makeState();
    applyGatewayTraceToPlatformState({
      state,
      entry: makeTrace({ kind: "receive", roomId: "room-1", userId: "user-1" }),
      buildPresence: createPresence,
    });

    expect(state.traceCount).toBe(1);
    expect(state.receiveCount).toBe(1);
    expect(state.lastReceivedAt).toBe("2026-03-30T00:00:00.000Z");
    expect(state.lastInboundAt).toBe("2026-03-30T00:00:00.000Z");
    expect(state.transportState).toBe("live");
    expect(state.presence.status).toBe("online");
    expect(state.presence.activity).toBe("Receiving traffic on api");
    expect(state.presence.lastHeartbeatAt).toBe("2026-03-30T00:00:00.000Z");
  });

  it("records heartbeat traces and preserves degraded state when not ready", () => {
    const state = makeState();
    state.ready = false;
    state.transportState = "degraded";
    applyGatewayTraceToPlatformState({
      state,
      entry: makeTrace({ kind: "heartbeat", at: "2026-03-30T00:01:00.000Z" }),
      buildPresence: createPresence,
    });

    expect(state.heartbeatCount).toBe(1);
    expect(state.transportState).toBe("degraded");
    expect(state.lastHeartbeatAt).toBe("2026-03-30T00:01:00.000Z");
    expect(state.presence.status).toBe("online");
    expect(state.presence.activity).toBe("api heartbeat");
  });

  it("degrades on reject when not ready and marks away", () => {
    const state = makeState();
    state.ready = false;
    applyGatewayTraceToPlatformState({
      state,
      entry: makeTrace({
        kind: "reject",
        platform: "discord",
      }),
      buildPresence: createPresence,
    });

    expect(state.rejectCount).toBe(1);
    expect(state.transportState).toBe("paused");
    expect(state.presence.status).toBe("away");
  });

  it("applies lifecycle transport state from running + ready flags", () => {
    const state = makeState();
    state.ready = false;
    applyGatewayTraceToPlatformState({
      state,
      entry: makeTrace({ kind: "lifecycle", detail: "gateway paused" }),
      buildPresence: createPresence,
    });

    expect(state.transportState).toBe("degraded");
    expect(state.presence.status).toBe("online");
    expect(state.presence.activity).toBe("gateway paused");
  });
});
