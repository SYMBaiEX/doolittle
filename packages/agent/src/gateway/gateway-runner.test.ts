import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { DeliveryService } from "@/services/delivery-service";
import { GatewaySessionService } from "@/services/gateway-session-service";
import { HooksService } from "@/services/hooks-service";
import { PairingService } from "@/services/pairing-service";
import { RunControllerService } from "@/services/run-controller-service";
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
      homeAssistantUrl: "https://homeassistant.local",
      homeAssistantToken: "token",
      allowAllUsers: true,
      pairingDefaultMode: "allow",
    } as AppContext["config"];

    const gatewayConfig = loadGatewayConfig(config);
    gatewayConfig.platforms.homeassistant.enabled = true;
    const context = {
      config,
      services: {
        gatewayConfig,
        pairing: new PairingService(join(root, "pairing")),
        gatewaySessions: new GatewaySessionService(
          join(root, "gateway-sessions"),
        ),
        delivery: new DeliveryService(join(root, "delivery")),
        hooks: new HooksService(join(root, "hooks")),
        sessions: new SessionService(join(root, "sessions")),
        userProfiles: new UserProfileService(join(root, "profiles")),
        runController: new RunControllerService(),
        executionApprovals: {
          latestPendingForSession() {
            return undefined;
          },
        },
        settings: {
          get() {
            return {
              agent: {
                runDepth: "standard",
                maxIterations: 45,
                toolProgressMode: "new",
              },
            };
          },
          set() {
            return undefined;
          },
        },
      },
      gateway: undefined as never,
      runtime: {} as never,
    } as unknown as AppContext;
    const runner = new GatewayRunner(context);
    const originalFetch = globalThis.fetch;

    const mockFetch: typeof fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input.toString()
            : input.url,
        );
        if (url.pathname === "/api/states") {
          return new Response(
            JSON.stringify([
              { entity_id: "light.kitchen", state: "on" },
              { entity_id: "sensor.temperature", state: "22.4" },
            ]),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (url.pathname === "/api/services/notify/eliza_agent") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      },
      {
        preconnect: async () => {},
      },
    ) as typeof fetch;
    globalThis.fetch = mockFetch;

    try {
      await runner.start();
      const result = await runner.receive({
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "/user list",
        messageId: "msg-api-1",
        metadata: {
          attachmentCount: "2",
          attachmentKinds: "image|document",
          attachmentNames: "Eliza Snapshot|Eliza Briefing.pdf",
          attachmentUrls:
            "https://example.com/snapshot.png|https://example.com/briefing.pdf",
          attachmentMimeTypes: "image/png|application/pdf",
        },
      });
      const traces = runner.trace(10);
      const history = await runner.history(10);
      const inbox = runner.inbox(10);
      const outbox = runner.outbox(10);
      const attachments = runner.attachments(10);
      const apiTraces = runner.trace(10, { platform: "api" });
      const state = await runner.state(10, { platform: "api" });
      const transportDetail = await runner.transport("api");
      const transportOverview = await runner.transportOverview();
      const heartbeatState = await runner.heartbeat("manual");
      const runtimeStatus = runner.runtimeStatus();
      const daemonStatus = runtimeStatus.daemon;
      const watchdogRecords = await runner.watchdog("manual");
      const watchRecords = await runner.watch("homeassistant", "manual");
      const restartRecords = await runner.restart("api", "manual");
      const refreshedRuntimeStatus = runner.runtimeStatus();
      const health = await runner.health();
      const apiHealth = health.find((entry) => entry.platform === "api");
      const supervision = await runner.supervise("test");
      const replayTarget = runner.inbox(10).at(0);

      expect(result.ok).toBe(true);
      expect(result.traceId).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.deliveryId).toBeDefined();
      expect(
        traces.some(
          (trace) =>
            trace.traceId === result.traceId && trace.kind === "deliver",
        ),
      ).toBe(true);
      expect(
        history.deliveries.some(
          (delivery) => delivery.id === result.deliveryId,
        ),
      ).toBe(true);
      expect(
        history.traces.some((trace) => trace.traceId === result.traceId),
      ).toBe(true);
      expect(history.traces.some((trace) => trace.kind === "route")).toBe(true);
      expect(history.inbox.some((record) => record.platform === "api")).toBe(
        true,
      );
      expect(history.outbox.some((record) => record.platform === "api")).toBe(
        true,
      );
      expect(
        history.attachments.some((record) => record.platform === "api"),
      ).toBe(true);
      expect(history.readiness.some((entry) => entry.platform === "api")).toBe(
        true,
      );
      expect(
        history.transportOverview.details.some(
          (entry) => entry.platform === "api",
        ),
      ).toBe(true);
      expect(history.transportOverview.mismatchCount).toBeGreaterThanOrEqual(0);
      expect(
        history.transportSummaries.some(
          (entry) => entry.platform === "api" && entry.traceCount > 0,
        ),
      ).toBe(true);
      expect(
        history.transportJournal.some(
          (entry) =>
            entry.platform === "api" &&
            entry.summary.includes("api:") &&
            entry.summary.includes("traces=") &&
            entry.summary.includes("restarts=") &&
            entry.summary.includes("failures="),
        ),
      ).toBe(true);
      expect(apiTraces.some((trace) => trace.traceId === result.traceId)).toBe(
        true,
      );
      expect(
        inbox.some((record) => record.sessionId === result.sessionId),
      ).toBe(true);
      expect(
        outbox.some((record) => record.sessionId === result.sessionId),
      ).toBe(true);
      expect(
        attachments.some((record) => record.sessionId === result.sessionId),
      ).toBe(true);
      expect(state.platforms.some((entry) => entry.platform === "api")).toBe(
        true,
      );
      const apiState = state.platforms.find(
        (entry) => entry.platform === "api",
      );
      expect(apiState?.lastOutboundRoomId).toBe("room-1");
      expect(apiState?.lastOutboundUserId).toBe("user-1");
      expect(apiState?.receiveCount).toBeGreaterThan(0);
      expect(apiState?.routeCount).toBeGreaterThan(0);
      expect(apiState?.respondCount).toBeGreaterThan(0);
      expect(apiState?.heartbeatCount).toBeGreaterThan(0);
      expect(apiState?.presence.status).toBe("online");
      expect(apiState?.lastReceivedAt).toBeDefined();
      expect(apiState?.lastInboundAt).toBeDefined();
      expect(apiState?.lastRoutedAt).toBeDefined();
      expect(apiState?.lastRespondedAt).toBeDefined();
      expect(apiState?.lastHeartbeatAt).toBeDefined();
      expect(apiState?.transportState).toBeDefined();
      expect(apiState?.inboxCount).toBeGreaterThan(0);
      expect(apiState?.outboxCount).toBeGreaterThan(0);
      expect(apiState?.attachmentCount).toBeGreaterThan(0);
      expect(apiState?.lastAttachmentAt).toBeDefined();
      expect(apiState?.lastAttachmentKind).toBeDefined();
      expect(apiState?.traceCount).toBeGreaterThan(0);
      expect(apiState?.lastTraceKind).toBe("deliver");
      expect(state.totals.totalTraces).toBeGreaterThanOrEqual(apiTraces.length);
      expect(state.totals.gatewayEnabledTransports).toBeGreaterThan(0);
      expect(state.totals.operationalTransports).toBeGreaterThanOrEqual(0);
      expect(transportDetail.platform).toBe("api");
      expect(transportDetail.inventory?.platform).toBe("api");
      expect(transportDetail.platformState?.platform).toBe("api");
      expect(transportDetail.summary.includes("api:")).toBe(true);
      expect(transportDetail.traceCount).toBeGreaterThan(0);
      expect(transportDetail.inboxCount).toBeGreaterThan(0);
      expect(transportDetail.outboxCount).toBeGreaterThan(0);
      expect(transportDetail.mismatchFlags).toEqual([]);
      expect(transportOverview.operationalCount).toBeGreaterThan(0);
      expect(transportOverview.mismatchCount).toBeGreaterThanOrEqual(0);
      expect(
        transportOverview.details.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(state.totals.inboxMessages).toBeGreaterThan(0);
      expect(state.totals.outboxMessages).toBeGreaterThan(0);
      expect(state.totals.attachmentRecords).toBeGreaterThan(0);
      expect(
        state.transportJournal.some(
          (entry) =>
            entry.platform === "api" &&
            entry.summary.includes("operational=") &&
            entry.summary.includes("mismatches="),
        ),
      ).toBe(true);
      expect(state.tracesByKind.some((entry) => entry.kind === "route")).toBe(
        true,
      );
      expect(
        state.tracesByPlatform.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(
        state.inboxByPlatform.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(
        state.outboxByPlatform.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(
        state.attachmentsByPlatform.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(
        state.attachmentsByKind.some((entry) => entry.kind === "image"),
      ).toBe(true);
      expect(state.totals.recentDeliveries).toBeGreaterThan(0);
      expect(
        state.deliveriesByPlatform.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(state.daemon.policy.restartBaseDelayMs).toBeGreaterThan(0);
      expect(state.daemon.watchdog.running).toBe(true);
      expect(
        state.daemon.restartQueue.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(state.watchdogAt).toBeDefined();
      expect(state.heartbeatAt).toBeDefined();
      expect(state.reason).toBe("history");
      expect(existsSync(state.snapshotPath)).toBe(true);
      expect(existsSync(state.historyPath)).toBe(true);
      expect(
        existsSync(join(root, "gateway", "journals", "gateway-inbox.jsonl")),
      ).toBe(true);
      expect(
        existsSync(join(root, "gateway", "journals", "gateway-outbox.jsonl")),
      ).toBe(true);
      expect(
        existsSync(
          join(root, "gateway", "journals", "gateway-attachments.jsonl"),
        ),
      ).toBe(true);
      const snapshot = JSON.parse(readFileSync(state.snapshotPath, "utf8")) as {
        reason?: string;
        state?: { heartbeatAt?: string; daemon?: unknown };
      };
      expect(
        snapshot.reason?.startsWith("watchdog:") ||
          snapshot.reason?.startsWith("supervise:"),
      ).toBe(true);
      expect(snapshot.state?.heartbeatAt).toBeDefined();
      expect(snapshot.state?.daemon).toBeDefined();
      expect(runtimeStatus.pid).toBeGreaterThan(0);
      expect(runtimeStatus.adapters).toContain("api");
      expect(daemonStatus.policy.watchdogIntervalMs).toBeGreaterThan(0);
      expect(daemonStatus.watchdog.running).toBe(true);
      expect(
        daemonStatus.restartQueue.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(runtimeStatus.transportControl.configured).toBeGreaterThan(0);
      expect(
        runtimeStatus.transportInventory.some(
          (entry) => entry.platform === "api",
        ),
      ).toBe(true);
      expect(
        runtimeStatus.messagingBridge.some(
          (entry) => entry.platform === "discord",
        ),
      ).toBe(true);
      expect(watchdogRecords.length).toBeGreaterThan(0);
      expect(restartRecords.some((record) => record.platform === "api")).toBe(
        true,
      );
      expect(
        watchRecords.some((record) => record.platform === "homeassistant"),
      ).toBe(true);
      expect(refreshedRuntimeStatus.daemon.state.watchdogRuns).toBeGreaterThan(
        0,
      );
      expect(
        heartbeatState.platforms.some((entry) => entry.platform === "api"),
      ).toBe(true);
      expect(apiHealth?.events.length ?? 0).toBeGreaterThan(0);
      expect(apiHealth?.status).toBeDefined();
      expect(apiHealth?.detail).toContain("api");
      expect(apiHealth?.presence?.status).toBeDefined();
      expect(supervision.length).toBeGreaterThan(0);
      expect(runner.supervision(10).length).toBeGreaterThan(0);
      if (!result.sessionId) {
        throw new Error("Expected a gateway session id.");
      }
      if (!replayTarget) {
        throw new Error("Expected a replay target.");
      }
      const replay = await runner.replayInbox(replayTarget.recordId);
      expect(replay.ok).toBe(true);
      expect(replay.traceId).toBeDefined();
      expect(replay.transportDetail?.platform).toBe("api");
      expect(replay.transportSummary?.includes("api:")).toBe(true);
      expect(replay.transportSummary?.includes("ready=")).toBe(true);
      context.services.gatewaySessions.markHome(result.sessionId, {
        isHome: true,
        label: "Primary API",
      });
      const homeDeliveries = await runner.sendToHomes("home-bound message", {
        metadata: { source: "test" },
        platforms: ["api"],
      });
      const progressive = await runner.sendProgressive(
        {
          platform: "api",
          roomId: "room-progressive",
          userId: "user-1",
        },
        ["draft update", "refined update", "final update"],
      );
      const edited = await runner.editDelivery(progressive.id, "edited again", {
        metadata: { revision: "4" },
      });
      const refreshed = context.services.delivery.get(progressive.id);
      expect(homeDeliveries.length).toBe(1);
      expect(homeDeliveries[0]?.text).toBe("home-bound message");
      expect(homeDeliveries[0]?.metadata?.source).toBe("test");
      expect(progressive.text).toBe("final update");
      expect(edited.text).toBe("edited again");
      expect(edited.editCount).toBeGreaterThanOrEqual(1);
      expect(refreshed?.metadata?.revision).toBe("4");
      expect(runner.trace(20).some((trace) => trace.kind === "update")).toBe(
        true,
      );
      expect(
        runner.outbox(20).some((record) => record.status === "edited"),
      ).toBe(true);
      expect(
        state.platforms.some((entry) => entry.platform === "mattermost"),
      ).toBe(true);
      expect(
        state.platforms.some((entry) => entry.platform === "homeassistant"),
      ).toBe(true);
      expect(
        state.platforms.some((entry) => entry.platform === "dingtalk"),
      ).toBe(true);
    } finally {
      await runner.stop();
      globalThis.fetch = originalFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
