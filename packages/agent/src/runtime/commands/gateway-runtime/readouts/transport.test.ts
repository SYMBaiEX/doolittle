import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../../chat";
import { handleTransportReadout } from "./transport";

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
          { platform: "discord", operational: false },
        ],
        transportControl: {
          configured: 3,
          operationalTransports: 2,
          liveServices: 1,
          gatewayEnabled: 2,
          enabledPlugins: 1,
          availableServices: 1,
        },
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
          startedAt: "2026-04-13T09:00:00.000Z",
          lastSendAt: "2026-04-13T09:02:00.000Z",
          sendCount: 4,
          events: [{ kind: "message" }],
          detail: "Telegram bridge live.",
        },
        {
          platform: "discord",
          status: "stopped",
          ready: false,
          mode: "pair",
          capabilities: { inbound: true, outbound: true, edits: false },
          nativePluginId: "messaging.discord",
          nativePluginSource: "official",
          lastError: "missing token",
          events: [],
          detail: "Discord bridge is configured but missing auth.",
        },
      ],
      transportOverview: async () => ({
        mismatchCount: 1,
        operationalCount: 1,
        details: [
          {
            platform: "discord",
            mismatchFlags: ["gateway-disabled", "service-unavailable"],
            inventory: {
              detail: "Discord is disabled in gateway config.",
            },
            platformState: undefined,
          },
        ],
      }),
      transport: async () => ({
        readiness: {
          status: "running",
          ready: true,
          mode: "paired",
          sendCount: 4,
          detail: "Telegram health looks good.",
        },
        platformState: {
          transportState: "running",
          presence: { status: "online" },
          sendCount: 4,
          receiveCount: 6,
          routeCount: 2,
          respondCount: 2,
          traceCount: 8,
          lastEventKind: "message",
          lastEventDetail: "recent inbound message",
          nativePluginId: "messaging.telegram",
          nativePluginSource: "official",
        },
        summary: "telegram operational and paired",
        traceCount: 8,
        inboxCount: 6,
        outboxCount: 4,
        attachmentCount: 1,
        mismatchFlags: [],
        recentTraces: [],
        recentInbox: [],
        recentOutbox: [],
        recentAttachments: [],
      }),
    },
  } as unknown as AgentExecutionContext;
}

describe("gateway transport readouts", () => {
  it("renders transport inventory and status summaries", async () => {
    const context = createContext();

    const inventory = await handleTransportReadout(
      "/transport inventory",
      context,
    );
    const status = await handleTransportReadout("/transport status", context);

    expect(inventory).toContain("Transport Inventory");
    expect(inventory).toContain("Configured:");
    expect(inventory).toContain("Use `/transport show <platform>`");
    expect(status).toContain("Transport Status");
    expect(status).toContain("Runtime: operational=");
    expect(status).toContain("Services: available=");
    expect(status).toContain("Use `/gateway readiness`");
  });

  it("renders readiness and mismatch summaries with actionable detail", async () => {
    const context = createContext();

    const readiness = await handleTransportReadout(
      "/gateway readiness",
      context,
    );
    const mismatches = await handleTransportReadout(
      "/transport mismatches",
      context,
    );

    expect(readiness).toContain("Gateway Readiness");
    expect(readiness).toContain("Gateway: configured=2 ready=1");
    expect(readiness).toContain("- telegram [running] ready=true");
    expect(readiness).toContain("- bridge telegram");
    expect(readiness).toContain("Use `/transport mismatches`");

    expect(mismatches).toContain("Transport Mismatches");
    expect(mismatches).toContain("Mismatch summary: 1 mismatch(es)");
    expect(mismatches).toContain("gateway-disabled, service-unavailable");
    expect(mismatches).toContain("Run `/transport show <platform>`");
  });

  it("renders a detailed drill-down for a specific transport", async () => {
    const context = createContext();

    const drilldown = await handleTransportReadout(
      "/transport show telegram",
      context,
    );

    expect(drilldown).toContain("Transport Drill-Down");
    expect(drilldown).toContain("Inventory: source=");
    expect(drilldown).toContain("Bridge: config=");
    expect(drilldown).toContain("Gateway health: status=running");
    expect(drilldown).toContain("Native plugin:");
  });
});
