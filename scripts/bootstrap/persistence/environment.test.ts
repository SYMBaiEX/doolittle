import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import type { WizardAnswers } from "../types";
import { buildBootstrapEnvUpdates } from "./environment";

const answers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "claude-code",
  backend: "daytona",
  browser: "lightpanda",
  runDepth: "deep",
  maxIterations: 90,
  toolProgressMode: "all",
  pairingMode: "allow",
  allowAllUsers: true,
  transports: ["telegram"],
  tools: {
    mcp: true,
    acp: true,
    tts: false,
    codegen: true,
  },
  openaiApiKey: "",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5.4",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "small",
  elizaCloudModel: "large",
  elizaCloudEmbeddingModel: "embedding",
  anthropicApiKey: "anthropic-key",
  useLinkedClaudeCodeAuth: true,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "token",
  anthropicModel: "claude-sonnet-4.6",
  telegramBotToken: "telegram-token",
  discordBotToken: "",
  slackWebhookUrl: "",
  slackSigningSecret: "",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "mcp-server",
  acpServerCommand: "acp-server",
  falApiKey: "",
  e2bApiKey: "e2b-key",
  githubToken: "github-key",
  sshHost: "",
  sshUser: "",
  sshPath: "",
  daytonaTarget: "daytona-target",
  modalTarget: "",
};

describe("bootstrap persistence env updates", () => {
  it("maps wizard answers into env updates with provider-aware defaults", () => {
    const envUpdates = buildBootstrapEnvUpdates(answers);

    expect(envUpdates.DOOLITTLE_NAME).toBe("Doolittle");
    expect(envUpdates.DOOLITTLE_MODE).toBe("cli");
    expect(envUpdates.DOOLITTLE_EXECUTION_BACKEND).toBe("daytona");
    expect(envUpdates.DOOLITTLE_DAYTONA_TARGET).toBe("daytona-target");
    expect(envUpdates.ANTHROPIC_API_KEY).toBe("");
    expect(envUpdates.CLAUDE_CODE_OAUTH_TOKEN).toBe("token");
    expect(envUpdates.DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH).toBe("true");
    expect(envUpdates.MCP_SERVER_COMMAND).toBe("mcp-server");
    expect(envUpdates.E2B_API_KEY).toBe("e2b-key");
    expect(envUpdates.OPENAI_API_KEY).toBe("");
    expect(envUpdates.TELEGRAM_BOT_TOKEN).toBe("telegram-token");
  });
});
