import { describe, expect, it } from "vitest";
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
  ollamaApiEndpoint: "http://localhost:11434/api",
  ollamaSmallModel: "granite4.1:3b",
  ollamaLargeModel: "granite4.1:3b",
  ollamaEmbeddingModel: "nomic-embed-text:latest",
  anthropicApiKey: "anthropic-key",
  useLinkedClaudeCodeAuth: true,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "token",
  anthropicModel: "claude-sonnet-4.6",
  telegramBotToken: "telegram-token",
  discordBotToken: "",
  slackBotToken: "xoxb-token",
  slackAppToken: "xapp-token",
  slackWebhookUrl: "",
  slackSigningSecret: "",
  whatsappAccessToken: "whatsapp-token",
  whatsappPhoneNumberId: "phone-id",
  whatsappVerifyToken: "verify-token",
  whatsappAppSecret: "app-secret",
  signalAccountNumber: "+15555550123",
  signalHttpUrl: "http://localhost:8080",
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
    expect(envUpdates.MCP_SERVER_COMMAND).toBe("");
    expect(envUpdates.E2B_API_KEY).toBe("e2b-key");
    expect(envUpdates.OPENAI_API_KEY).toBe("");
    expect(envUpdates.TELEGRAM_BOT_TOKEN).toBe("telegram-token");
    expect(envUpdates.SLACK_BOT_TOKEN).toBe("xoxb-token");
    expect(envUpdates.SLACK_APP_TOKEN).toBe("xapp-token");
    expect(envUpdates.WHATSAPP_ACCESS_TOKEN).toBe("whatsapp-token");
    expect(envUpdates.WHATSAPP_APP_SECRET).toBe("app-secret");
    expect(envUpdates.SIGNAL_ACCOUNT_NUMBER).toBe("+15555550123");
    expect(envUpdates.SIGNAL_HTTP_URL).toBe("http://localhost:8080");
    expect(envUpdates.OLLAMA_API_ENDPOINT).toBe("http://localhost:11434/api");
    expect(envUpdates.OLLAMA_SMALL_MODEL).toBe("granite4.1:3b");
    expect(envUpdates.OLLAMA_LARGE_MODEL).toBe("granite4.1:3b");
    expect(envUpdates.OLLAMA_EMBEDDING_MODEL).toBe("nomic-embed-text:latest");
    expect(envUpdates.DOOLITTLE_EMBEDDING_PROVIDER).toBe("local");
    expect(envUpdates.DOOLITTLE_USE_LINKED_CODEX_AUTH).toBe("false");
  });
});
