import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import type { NativeOnboardingMirrorResult } from "../answers";
import type { WizardAnswers } from "../types";
import { buildBootstrapOnboardingSummary, fingerprint } from "./index";

const answers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "openai",
  backend: "local",
  browser: "basic",
  runDepth: "standard",
  maxIterations: 45,
  toolProgressMode: "new",
  pairingMode: "allow",
  allowAllUsers: true,
  transports: ["telegram", "slack"],
  tools: { mcp: true, acp: false, tts: true, codegen: false },
  openaiApiKey: "openai-key",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5.4",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "xai/grok-4.1-fast-non-reasoning",
  elizaCloudModel: "xai/grok-4.1-fast-reasoning",
  elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
  anthropicApiKey: "",
  useLinkedClaudeCodeAuth: false,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "",
  anthropicModel: "claude-sonnet-4.6",
  telegramBotToken: "telegram-token",
  discordBotToken: "",
  slackWebhookUrl: "https://slack.example/webhook",
  slackSigningSecret: "slack-secret",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "npx -y @modelcontextprotocol/server-filesystem .",
  acpServerCommand: "",
  falApiKey: "fal-key",
  e2bApiKey: "",
  githubToken: "",
  sshHost: "",
  sshUser: "",
  sshPath: "",
  daytonaTarget: "",
  modalTarget: "",
};

describe("bootstrap persistence onboarding summary", () => {
  it("builds a stable onboarding summary with a fingerprint", () => {
    const nativeOnboarding: NativeOnboardingMirrorResult = {
      complete: true,
      currentStep: "SKILLS",
      summary: "ready",
    };
    const summary = buildBootstrapOnboardingSummary({
      answers,
      nativeOnboarding,
      nativeConnection: {
        kind: "linked",
        provider: "openai",
        detail: "connected",
      },
      timestamp: "2026-03-29T12:00:00.000Z",
      mode: "quick",
    });

    expect(summary.timestamp).toBe("2026-03-29T12:00:00.000Z");
    expect(summary.nativeOnboarding.summary).toBe("ready");
    expect(summary.nativeConnection.kind).toBe("linked");
    expect(summary.profile).toHaveLength(12);
    expect(fingerprint({ alpha: true, beta: ["x", "y"] })).toHaveLength(12);
  });
});
