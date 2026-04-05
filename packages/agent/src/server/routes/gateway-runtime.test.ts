import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      daemon: { running: true },
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

  it("updates gateway config and rewires diagnostics/operator services", async () => {
    const { context } = createContext();
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
      runtime: {
        daemon: { running: boolean };
      };
    };
    expect(runtimeBody.runtime.daemon.running).toBe(true);
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
