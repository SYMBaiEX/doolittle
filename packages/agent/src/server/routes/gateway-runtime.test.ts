import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GatewayDeliveryRetryError } from "@/gateway/runner/operations";
import type { AppContext } from "@/runtime/bootstrap";
import { handleGatewayRuntimeRoutes } from "@/server/routes/gateway-runtime/index";

const PLATFORM_NAMES = [
  "api",
  "cli",
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
] as const;

function buildGatewayConfig() {
  return {
    allowAllUsers: true,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: Object.fromEntries(
      PLATFORM_NAMES.map((platform) => [
        platform,
        {
          enabled: platform === "api" || platform === "cli",
          allowedUserIds: [],
          pairingMode:
            platform === "api" || platform === "cli" ? "allow" : "pair",
          allowAllUsers:
            platform === "api" || platform === "cli" ? true : undefined,
        },
      ]),
    ),
  };
}

function createContext() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-route-"));
  const workspaceDir = join(root, "workspace");
  const dataDir = join(root, "data");
  const skillsDir = join(root, "skills");
  const gatewayDataDir = join(root, "gateway");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(gatewayDataDir, { recursive: true });

  const gatewayConfig = buildGatewayConfig();
  let currentGatewayConfig = gatewayConfig;
  const diagnostics = {
    currentGatewayConfig: () => currentGatewayConfig,
    updateGatewayConfig: (nextGatewayConfig: typeof gatewayConfig) => {
      currentGatewayConfig = nextGatewayConfig;
    },
  };
  const operator = {};
  const gateway = {
    health: async () => ({ ready: true }),
    history: async (limit: number) => ({
      limit,
      state: {
        totals: {
          pluginMediatedAdapters: 1,
          officialPluginAdapters: 1,
          vendoredPluginAdapters: 0,
        },
      },
      traces: [{ id: "trace-1" }],
      inbox: [{ id: "inbox-1" }],
      outbox: [{ id: "outbox-1" }],
      attachments: [{ id: "attachment-1" }],
      deliveries: [{ id: "delivery-1" }],
    }),
    trace: (limit: number) => [{ id: `trace:${limit}` }],
    inbox: (limit: number) => [{ id: `inbox:${limit}` }],
    outbox: (limit: number) => [{ id: `outbox:${limit}` }],
    attachments: (limit: number) => [{ id: `attachment:${limit}` }],
    state: async (limit: number) => ({ limit }),
    runtimeStatus: () => ({
      daemon: { watchdog: { running: true } },
      messagingBridge: [{ platform: "telegram", live: true }],
      transportInventory: [{ platform: "api", gatewayEnabled: true }],
      transportControl: { configured: 2 },
    }),
    start: async () => undefined,
    stop: async () => undefined,
    watchdog: async (reason: string) => [{ reason, kind: "watchdog" }],
    watch: async (platform: string, reason: string) => [
      { platform, reason, kind: "watch" },
    ],
    restart: async (platform: string, reason: string) => [
      { platform, reason, kind: "restart" },
    ],
    receive: async (message: Record<string, unknown>) => ({
      ok: true,
      message,
    }),
    retryDelivery: async (recordId: string) => ({
      id: `delivery:${recordId}`,
      target: {
        platform: "api",
        channelId: "room-1",
        mode: "explicit",
      },
      text: "retried",
      createdAt: "2026-08-15T00:00:00.000Z",
    }),
    replayInbox: async (recordId: string) => ({ recordId, ok: true }),
    supervise: async () => [{ id: "supervision-run" }],
    supervision: (limit: number) => [{ id: `supervision:${limit}` }],
    editDelivery: async (deliveryId: string, text: string) => ({
      deliveryId,
      text,
    }),
    sendProgressive: async (
      target: Record<string, unknown>,
      parts: string[],
    ) => ({
      target,
      parts,
    }),
  };

  return {
    context: {
      config: {
        agentName: "Doolittle Test",
        mode: "api",
        host: "127.0.0.1",
        port: 0,
        workspaceDir,
        dataDir,
        skillsDir,
        gatewayDataDir,
        pairingDefaultMode: "pair",
        allowAllUsers: true,
        telegramBotToken: "",
        discordBotToken: "",
      },
      runtime: {},
      gateway,
      services: {
        gatewayConfig,
        gatewaySessions: {
          list: () => [{ id: "session-1" }],
        },
        nativeOwnership: {
          controlPlane: () => ({
            transportControl: {
              messagingBridge: [{ platform: "telegram", live: true }],
              transportInventory: [{ platform: "telegram", enabled: true }],
              totals: { configured: 1 },
            },
            pluginManager: { available: true },
            identity: { source: "runtime" },
          }),
          attachRuntime: () => undefined,
        },
        agentSdk: undefined,
        ecosystem: undefined,
        settings: undefined,
        runController: undefined,
        startupState: undefined,
        awareness: undefined,
        autocoderPipeline: undefined,
        diagnostics,
        operator,
      },
    } as unknown as AppContext,
  };
}

describe("handleGatewayRuntimeRoutes", () => {
  it("returns gateway health with ownership and history views", async () => {
    const { context } = createContext();
    const response = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/health"),
      new URL("http://localhost/gateway/health"),
    );

    expect(response).not.toBeNull();
    const body = (await response?.json()) as {
      health: { ready: boolean };
      sessions: Array<{ id: string }>;
      traces: Array<{ id: string }>;
    };

    expect(body.health.ready).toBe(true);
    expect(body.sessions).toEqual([{ id: "session-1" }]);
    expect(body.traces).toEqual([{ id: "trace-1" }]);
  });

  it("updates gateway config without replacing live service instances", async () => {
    const { context } = createContext();
    const diagnostics = context.services.diagnostics;
    const operator = context.services.operator;
    const nextGatewayConfig = {
      ...buildGatewayConfig(),
      sessionTimeoutMinutes: 30,
    };
    const response = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/config", {
        method: "POST",
        body: JSON.stringify(nextGatewayConfig),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/config"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      gateway: nextGatewayConfig,
    });
    expect(context.services.gatewayConfig.sessionTimeoutMinutes).toBe(30);
    expect(
      context.services.diagnostics.currentGatewayConfig().sessionTimeoutMinutes,
    ).toBe(30);
    expect(context.services.diagnostics).toBe(diagnostics);
    expect(context.services.operator).toBe(operator);
  });

  it("validates watch, edit, and progressive payloads", async () => {
    const { context } = createContext();
    const watchResponse = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/watch", {
        method: "POST",
        body: JSON.stringify({ platform: "nope" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/watch"),
    );
    const editResponse = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/message/edit", {
        method: "POST",
        body: JSON.stringify({ deliveryId: "del-1" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/message/edit"),
    );
    const progressiveResponse = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/message/progressive", {
        method: "POST",
        body: JSON.stringify({
          platform: "api",
          roomId: "room-1",
          parts: ["one"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/message/progressive"),
    );

    expect(watchResponse?.status).toBe(400);
    expect(editResponse?.status).toBe(400);
    expect(progressiveResponse?.status).toBe(400);
  });

  it("returns stable 400 responses for malformed gateway control bodies", async () => {
    const { context } = createContext();
    const malformedWatch = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/watch", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/gateway/watch"),
    );
    const arrayConfig = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/config", {
        method: "POST",
        body: JSON.stringify([]),
      }),
      new URL("http://localhost/gateway/config"),
    );

    expect(malformedWatch?.status).toBe(400);
    await expect(malformedWatch?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arrayConfig?.status).toBe(400);
    await expect(arrayConfig?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
  });

  it("parses JSON for gateway message and replay endpoints", async () => {
    const { context } = createContext();
    const invalidMessage = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/message", {
        method: "POST",
        body: "{bad json",
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/message"),
    );
    const replayMissing = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/replay", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/gateway/replay"),
    );
    const runtimeResponse = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/runtime"),
      new URL("http://localhost/gateway/runtime"),
    );

    expect(invalidMessage?.status).toBe(400);
    expect(replayMissing?.status).toBe(400);
    const runtimeBody = (await runtimeResponse?.json()) as {
      summary: {
        headline: string;
      };
      runtime: {
        daemon: { watchdog: { running: boolean } };
      };
    };
    expect(runtimeBody.summary.headline).toContain("Gateway runtime");
    expect(runtimeBody.runtime.daemon.watchdog.running).toBe(true);
  });

  it("distinguishes delivery failure from authorization rejection", async () => {
    const { context } = createContext();
    context.gateway.receive = async () => ({
      ok: false,
      response: "computed",
      agentCompleted: true,
      deliveryStatus: "rejected",
      outboxRecordId: "outbox-rejected",
    });
    const deliveryFailure = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/message", {
        method: "POST",
        body: JSON.stringify({
          platform: "api",
          userId: "user-1",
          roomId: "room-1",
          text: "hello",
        }),
      }),
      new URL("http://localhost/gateway/message"),
    );
    context.gateway.receive = async () => ({
      ok: false,
      response: "Authorization required",
    });
    const authorization = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/message", {
        method: "POST",
        body: JSON.stringify({
          platform: "api",
          userId: "user-1",
          roomId: "room-1",
          text: "hello",
        }),
      }),
      new URL("http://localhost/gateway/message"),
    );

    expect(deliveryFailure?.status).toBe(502);
    expect(authorization?.status).toBe(403);
  });

  it("forwards the initiating request signal to gateway receive", async () => {
    const { context } = createContext();
    let receivedAbortSignal: AbortSignal | undefined;
    context.gateway.receive = async (_message, options) => {
      receivedAbortSignal = options?.abortSignal;
      return { ok: true, response: "" };
    };
    const request = new Request("http://localhost/gateway/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      }),
    });

    const response = await handleGatewayRuntimeRoutes(
      context,
      request,
      new URL(request.url),
    );

    expect(response?.status).toBe(200);
    expect(receivedAbortSignal).toBe(request.signal);
  });

  it("retries a rejected delivery through the authenticated gateway surface", async () => {
    const { context } = createContext();
    const retry = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/delivery/retry", {
        method: "POST",
        body: JSON.stringify({ recordId: "outbox-rejected" }),
      }),
      new URL("http://localhost/gateway/delivery/retry"),
    );
    const missing = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/gateway/delivery/retry", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      new URL("http://localhost/gateway/delivery/retry"),
    );

    expect(retry?.status).toBe(200);
    await expect(retry?.json()).resolves.toMatchObject({
      delivery: { id: "delivery:outbox-rejected", text: "retried" },
    });
    expect(missing?.status).toBe(400);
  });

  it("maps typed delivery retry failures without exposing an internal error", async () => {
    const expected = [
      ["not_found", 404],
      ["adapter_unavailable", 503],
      ["already_completed", 409],
      ["delivery_failed", 502],
    ] as const;

    for (const [code, status] of expected) {
      const { context } = createContext();
      context.gateway.retryDelivery = async () => {
        throw new GatewayDeliveryRetryError(code, `retry ${code}`);
      };
      const response = await handleGatewayRuntimeRoutes(
        context,
        new Request("http://localhost/gateway/delivery/retry", {
          method: "POST",
          body: JSON.stringify({ recordId: "outbox-rejected" }),
        }),
        new URL("http://localhost/gateway/delivery/retry"),
      );

      expect(response?.status).toBe(status);
      await expect(response?.json()).resolves.toEqual({
        error: `retry ${code}`,
        code,
      });
    }
  });

  it("returns null for unrelated routes", async () => {
    const { context } = createContext();
    const response = await handleGatewayRuntimeRoutes(
      context,
      new Request("http://localhost/not-gateway"),
      new URL("http://localhost/not-gateway"),
    );

    expect(response).toBeNull();
  });
});
