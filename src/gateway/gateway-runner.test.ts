import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { DeliveryService } from "@/services/delivery-service";
import { GatewaySessionService } from "@/services/gateway-session-service";
import { HooksService } from "@/services/hooks-service";
import { PairingService } from "@/services/pairing-service";
import { SessionService } from "@/services/session-service";
import { UserProfileService } from "@/services/user-profile-service";
import { GatewayRunner } from "./gateway-runner";

describe("GatewayRunner", () => {
  it("records transport traces and lifecycle events for inbound messages", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-gateway-runner-"));
    const config = {
      agentName: "test-agent",
      mode: "cli",
      host: "127.0.0.1",
      port: 0,
      dataDir: join(root, "data"),
      gatewayDataDir: join(root, "gateway"),
      allowAllUsers: true,
      pairingDefaultMode: "allow",
    } as AppContext["config"];

    const gatewayConfig = loadGatewayConfig(config);
    const context = {
      config,
      services: {
        gatewayConfig,
        pairing: new PairingService(join(root, "pairing")),
        gatewaySessions: new GatewaySessionService(join(root, "gateway-sessions")),
        delivery: new DeliveryService(join(root, "delivery")),
        hooks: new HooksService(join(root, "hooks")),
        sessions: new SessionService(join(root, "sessions")),
        userProfiles: new UserProfileService(join(root, "profiles")),
      },
      gateway: undefined as never,
      runtime: {} as never,
    } as unknown as AppContext;
    const runner = new GatewayRunner(context);

    try {
      await runner.start();
      const result = await runner.receive({
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "/user list",
      });
      const traces = runner.trace(10);
      const history = await runner.history(10);
      const apiTraces = runner.trace(10, { platform: "api" });
      const state = await runner.state(10, { platform: "api" });
      const health = await runner.health();
      const apiHealth = health.find((entry) => entry.platform === "api");

      expect(result.ok).toBe(true);
      expect(result.traceId).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.deliveryId).toBeDefined();
      expect(traces.some((trace) => trace.traceId === result.traceId && trace.kind === "deliver")).toBe(true);
      expect(history.deliveries.some((delivery) => delivery.id === result.deliveryId)).toBe(true);
      expect(history.traces.some((trace) => trace.traceId === result.traceId)).toBe(true);
      expect(history.traces.some((trace) => trace.kind === "route")).toBe(true);
      expect(history.readiness.some((entry) => entry.platform === "api")).toBe(true);
      expect(apiTraces.some((trace) => trace.traceId === result.traceId)).toBe(true);
      expect(state.platforms.some((entry) => entry.platform === "api")).toBe(true);
      const apiState = state.platforms.find((entry) => entry.platform === "api");
      expect(apiState?.lastOutboundRoomId).toBe("room-1");
      expect(apiState?.lastOutboundUserId).toBe("user-1");
      expect(apiState?.traceCount).toBeGreaterThan(0);
      expect(apiState?.lastTraceKind).toBe("deliver");
      expect(state.totals.totalTraces).toBeGreaterThanOrEqual(apiTraces.length);
      expect(state.tracesByKind.some((entry) => entry.kind === "route")).toBe(true);
      expect(state.tracesByPlatform.some((entry) => entry.platform === "api")).toBe(true);
      expect(state.totals.recentDeliveries).toBeGreaterThan(0);
      expect(state.deliveriesByPlatform.some((entry) => entry.platform === "api")).toBe(true);
      expect(apiHealth?.events.length ?? 0).toBeGreaterThan(0);
      expect(apiHealth?.events.some((event) => event.kind === "respond")).toBe(true);
      expect(apiHealth?.events.some((event) => event.kind === "deliver")).toBe(true);
      expect(apiHealth?.events.some((event) => event.kind === "health")).toBe(true);
    } finally {
      await runner.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
