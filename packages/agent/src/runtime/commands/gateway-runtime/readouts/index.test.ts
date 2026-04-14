import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../../chat";
import { handleGatewayRuntimeReadoutCommand } from "./index";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "discord:room-1:user-1:root",
    source: "discord",
  };
}

function createContext() {
  return {
    runtime: {},
    config: {
      telegramBotToken: "telegram-token",
      discordBotToken: "",
      elizaCloudApiKey: undefined,
      elizaCloudEnabled: false,
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
      openAiApiKey: undefined,
      anthropicApiKey: undefined,
    },
    services: {
      gatewayConfig: {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      },
    },
    gateway: {
      runtimeStatus: () => ({
        daemon: { watchdog: { running: true } },
        messagingBridge: [{ platform: "telegram", live: true }],
        transportInventory: [
          { platform: "api", operational: true },
          { platform: "telegram", operational: true },
        ],
        transportControl: {
          configured: 2,
          operationalTransports: 2,
          liveServices: 1,
          gatewayEnabled: 2,
          enabledPlugins: 1,
          availableServices: 1,
        },
      }),
      state: async () => ({
        totals: {
          configuredPlatforms: 2,
          readyAdapters: 2,
          pluginMediatedAdapters: 1,
          officialPluginAdapters: 1,
          vendoredPluginAdapters: 0,
          totalTraces: 2,
          inboxMessages: 3,
          outboxMessages: 4,
        },
        platforms: [
          {
            platform: "telegram",
            transportState: "running",
            ready: true,
            mode: "paired",
            presence: { status: "online" },
            nativePluginId: "messaging.telegram",
            nativePluginSource: "official",
            lastEventKind: "message",
            sendCount: 2,
            receiveCount: 3,
            routeCount: 1,
            respondCount: 1,
            eventCount: 5,
            detail: "Telegram bridge live.",
          },
        ],
      }),
      health: async () => [
        {
          platform: "telegram",
          status: "running",
          ready: true,
          mode: "paired",
          capabilities: { inbound: true, outbound: true, edits: true },
          nativePluginId: "messaging.telegram",
          nativePluginSource: "official",
          events: [{ kind: "message" }],
          detail: "Telegram bridge live.",
        },
      ],
      transportOverview: async () => ({
        mismatchCount: 0,
        operationalCount: 1,
        details: [],
      }),
    },
  } as unknown as AgentExecutionContext;
}

describe("gateway runtime readouts", () => {
  it("renders guided runtime and daemon summaries", async () => {
    const context = createContext();
    const runtime = await handleGatewayRuntimeReadoutCommand(
      createInput("/gateway runtime"),
      "/gateway runtime",
      context,
    );
    const daemon = await handleGatewayRuntimeReadoutCommand(
      createInput("/gateway daemon"),
      "/gateway daemon",
      context,
    );

    expect(runtime).toContain("Gateway Runtime");
    expect(runtime).toContain("Next:");
    expect(daemon).toContain("Gateway Daemon");
    expect(daemon).toContain("Running: yes");
  });

  it("renders guided platform and state summaries", async () => {
    const context = createContext();
    const platforms = await handleGatewayRuntimeReadoutCommand(
      createInput("/platforms status"),
      "/platforms status",
      context,
    );
    const state = await handleGatewayRuntimeReadoutCommand(
      createInput("/gateway state"),
      "/gateway state",
      context,
    );

    expect(platforms).toContain("Platform Status");
    expect(platforms).toContain("Next:");
    expect(state).toContain("Gateway State");
    expect(state).toContain("Use the HTTP `GET /gateway/state` route");
  });
});
