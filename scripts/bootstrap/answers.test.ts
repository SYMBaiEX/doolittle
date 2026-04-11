import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../packages/agent/src/runtime/theme-catalog";
import { finalizeWizardAnswers, summarizeAnswers } from "./answers";
import {
  DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
  DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
  normalizeElizaCloudEmbeddingModel,
  normalizeElizaCloudLargeModel,
  normalizeElizaCloudSmallModel,
} from "./answers/model-normalization";
import {
  applyProviderFallbacks,
  pruneUnavailableTransports,
} from "./answers/review";
import type { WizardAnswers } from "./types";

const baseAnswers: WizardAnswers = {
  mode: "ritual",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "openai",
  backend: "local",
  browser: "lightpanda",
  runDepth: "standard",
  maxIterations: 45,
  toolProgressMode: "new",
  pairingMode: "pair",
  allowAllUsers: false,
  transports: ["telegram", "matrix"],
  tools: {
    mcp: true,
    acp: false,
    tts: false,
    codegen: false,
  },
  openaiApiKey: "",
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

describe("bootstrap answer helpers", () => {
  it("normalizes legacy Eliza Cloud model aliases to the current defaults", () => {
    expect(normalizeElizaCloudLargeModel("anthropic/claude-sonnet-4.6")).toBe(
      DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
    );
    expect(
      normalizeElizaCloudSmallModel("xai/grok-4.1-fast-reasoning-beta"),
    ).toBe(DEFAULT_ELIZA_CLOUD_SMALL_MODEL);
    expect(normalizeElizaCloudEmbeddingModel("text-embedding-3-small")).toBe(
      DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
    );
  });

  it("summarizes the chosen configuration with the selected provider and tools", () => {
    const lines = summarizeAnswers({
      ...baseAnswers,
      provider: "elizacloud",
      elizaCloudApiKey: "cloud-key",
      tools: { ...baseAnswers.tools, acp: true, codegen: true },
    });

    expect(lines).toContain(
      "mind=elizacloud model=xai/grok-4.1-fast-reasoning embed=openai/text-embedding-3-small",
    );
    expect(lines).toContain("tools=mcp, acp, codegen");
  });

  it("switches openai to linked Claude Code when the linked account is ready", () => {
    const next: WizardAnswers = {
      ...baseAnswers,
      provider: "openai",
      openaiApiKey: "",
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
    };
    const notices: string[] = [];

    applyProviderFallbacks(next, { codex: false, claudeCode: true }, notices);

    expect(next.provider).toBe("claude-code");
    expect(next.useLinkedClaudeCodeAuth).toBe(true);
    expect(notices).toContain(
      "OpenAI had no key, so I switched the active mind to linked Claude Code instead of leaving you with a silent boot.",
    );
  });

  it("drops transports whose credentials were left blank", () => {
    const next: WizardAnswers = {
      ...baseAnswers,
      transports: ["telegram", "slack", "matrix"],
      telegramBotToken: "telegram-token",
      slackWebhookUrl: "",
      slackSigningSecret: "",
    };
    const notices: string[] = [];

    pruneUnavailableTransports(next, notices);

    expect(next.transports).toEqual(["telegram", "matrix"]);
    expect(notices).toContain(
      "slack was deselected because its required credentials were left blank.",
    );
  });

  it("falls back to offline when required bindings are missing", () => {
    const reviewed = finalizeWizardAnswers(baseAnswers, {
      codex: { nativeReady: false, reusable: false },
      claudeCode: { nativeReady: false, reusable: false },
    } as never);

    expect(reviewed.answers.provider).toBe("offline");
    expect(reviewed.answers.transports).toEqual(["matrix"]);
    expect(reviewed.notices).toContain(
      "No OpenAI key or linked account was available, so I left the mind dormant instead of writing a broken provider state.",
    );
    expect(reviewed.notices).toContain(
      "telegram was deselected because its required credentials were left blank.",
    );
  });
});
