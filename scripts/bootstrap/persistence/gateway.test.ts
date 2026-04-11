import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import type { GatewayConfig, WizardAnswers } from "../types";
import { REMOTE_TRANSPORTS } from "./defaults";
import { buildBootstrapGateway } from "./gateway";

const answers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "openai",
  backend: "local",
  browser: "lightpanda",
  runDepth: "standard",
  maxIterations: 45,
  toolProgressMode: "new",
  pairingMode: "deny",
  allowAllUsers: false,
  transports: ["telegram", "slack"],
  tools: {
    mcp: false,
    acp: false,
    tts: false,
    codegen: false,
  },
  openaiApiKey: "",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5.4",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "small",
  elizaCloudModel: "large",
  elizaCloudEmbeddingModel: "embedding",
  anthropicApiKey: "",
  useLinkedClaudeCodeAuth: false,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "",
  anthropicModel: "claude-sonnet-4.6",
  telegramBotToken: "",
  discordBotToken: "",
  slackWebhookUrl: "",
  slackSigningSecret: "",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "",
  acpServerCommand: "",
  falApiKey: "",
  e2bApiKey: "",
  githubToken: "",
  sshHost: "",
  sshUser: "",
  sshPath: "",
  daytonaTarget: "",
  modalTarget: "",
};

const gateway: GatewayConfig = {
  allowAllUsers: true,
  sessionTimeoutMinutes: 75,
  mirrorResponsesToHistory: false,
  platforms: Object.fromEntries(
    ["api", "cli", ...REMOTE_TRANSPORTS].map((platform) => [
      platform,
      {
        enabled: false,
        allowedUserIds: ["existing-user"],
        pairingMode: "allow",
        allowAllUsers: true,
      },
    ]),
  ) as GatewayConfig["platforms"],
};

describe("bootstrap persistence gateway", () => {
  it("projects wizard answers into gateway platform state", () => {
    const next = buildBootstrapGateway(gateway, answers);

    expect(next.allowAllUsers).toBe(false);
    expect(next.sessionTimeoutMinutes).toBe(75);
    expect(next.mirrorResponsesToHistory).toBe(false);
    expect(next.platforms.api.enabled).toBe(true);
    expect(next.platforms.api.pairingMode).toBe("allow");
    expect(next.platforms.api.allowAllUsers).toBe(true);
    expect(next.platforms.cli.enabled).toBe(true);
    expect(next.platforms.cli.pairingMode).toBe("allow");
    expect(next.platforms.telegram.enabled).toBe(true);
    expect(next.platforms.slack.enabled).toBe(true);
    expect(next.platforms.whatsapp.enabled).toBe(false);
    expect(next.platforms.telegram.pairingMode).toBe("deny");
    expect(next.platforms.telegram.allowAllUsers).toBe(undefined);
    expect(next.platforms.slack.allowAllUsers).toBe(undefined);
  });
});
