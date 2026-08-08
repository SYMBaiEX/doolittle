import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardAnswers } from "../types";
import {
  applyProviderFallbacks,
  getLinkedProviderReadiness,
  pruneUnavailableTools,
  pruneUnavailableTransports,
  reviewWizardAnswers,
} from "./review";

const baseAnswers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: "orange",
  provider: "openai",
  backend: "local",
  browser: "basic",
  runDepth: "quick",
  maxIterations: 15,
  toolProgressMode: "off",
  pairingMode: "pair",
  allowAllUsers: false,
  transports: ["telegram", "slack", "matrix"],
  tools: {
    mcp: true,
    acp: false,
    tts: true,
    codegen: true,
  },
  openaiApiKey: "",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "",
  elizaCloudModel: "",
  elizaCloudEmbeddingModel: "",
  ollamaApiEndpoint: "http://localhost:11434/api",
  ollamaSmallModel: "granite4.1:3b",
  ollamaLargeModel: "granite4.1:3b",
  ollamaEmbeddingModel: "nomic-embed-text:latest",
  anthropicApiKey: "",
  useLinkedClaudeCodeAuth: false,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "",
  anthropicModel: "claude-sonnet-4",
  telegramBotToken: "telegram",
  discordBotToken: "",
  slackWebhookUrl: "",
  slackSigningSecret: "",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "",
  acpServerCommand: "acp",
  falApiKey: "",
  e2bApiKey: "",
  githubToken: "",
  sshHost: "",
  sshUser: "",
  sshPath: "",
  daytonaTarget: "",
  modalTarget: "",
};

const linkedAccounts = {
  codex: {
    provider: "codex",
    available: true,
    reusable: true,
    nativeReady: true,
    detail: "codex",
  },
  claudeCode: {
    provider: "claude-code",
    available: false,
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    detail: "claude",
  },
  devin: {
    provider: "devin",
    available: false,
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    detail: "devin",
  },
  elizaCloud: {
    provider: "elizacloud",
    available: false,
    reusable: false,
    detail: "cloud",
  },
} as const;

describe("bootstrap answer review helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("maps provider readiness from native linked accounts", () => {
    expect(
      getLinkedProviderReadiness({
        codex: { nativeReady: true, reusable: false },
        claudeCode: { nativeReady: false, reusable: true },
      } as never),
    ).toEqual({ devin: false, codex: true, claudeCode: true });
  });

  it("falls back openai to linked codex when no api key is provided", () => {
    const notices: string[] = [];
    const next: WizardAnswers = {
      ...baseAnswers,
      provider: "openai",
      openaiApiKey: "",
    };

    applyProviderFallbacks(next, { codex: true, claudeCode: false }, notices);

    expect(next.provider).toBe("codex");
    expect(next.useLinkedCodexAuth).toBe(true);
    expect(next.openaiModel).toBe("gpt-5");
    expect(notices[0]).toContain("linked Codex");
  });

  it("drops unavailable tools and transports into fallback state with notices", () => {
    const notices: string[] = [];
    const next: WizardAnswers = {
      ...baseAnswers,
      tools: { ...baseAnswers.tools },
      transports: [...baseAnswers.transports],
      mcpServerCommand: "",
      acpServerCommand: "",
      e2bApiKey: "",
      githubToken: "",
      slackWebhookUrl: "",
      slackSigningSecret: "",
      homeAssistantUrl: "",
      homeAssistantToken: "",
    };

    pruneUnavailableTools(next, notices);
    pruneUnavailableTransports(next, notices);

    expect(next.tools).toEqual({
      mcp: false,
      acp: false,
      tts: true,
      codegen: false,
    });
    expect(next.transports).toEqual(["telegram", "matrix"]);
    expect(notices).toContain(
      "MCP stayed disabled because no server command was bound.",
    );
    expect(notices).toContain(
      "Codegen stayed disabled because neither E2B nor GitHub credentials were provided.",
    );
    expect(notices).toContain(
      "slack was deselected because its required credentials were left blank.",
    );
  });

  it("returns cloned answers, applies transforms, and keeps source answer immutable", () => {
    const source: WizardAnswers = {
      ...baseAnswers,
      provider: "openai",
      openaiApiKey: "",
      useLinkedCodexAuth: false,
    };

    const result = reviewWizardAnswers(source, linkedAccounts);

    expect(result.answers).not.toBe(source);
    expect(result.answers.tools).not.toBe(source.tools);
    expect(result.answers.transports).not.toBe(source.transports);
    expect(result.answers.provider).toBe("codex");
    expect(result.answers.useLinkedCodexAuth).toBe(true);
    expect(source.provider).toBe("openai");
  });

  it("keeps transports configured through official connector credentials", () => {
    const notices: string[] = [];
    const next: WizardAnswers = {
      ...baseAnswers,
      transports: ["slack", "whatsapp", "signal"],
      slackBotToken: "xoxb-token",
      slackAppToken: "xapp-token",
      whatsappAccessToken: "whatsapp-token",
      whatsappPhoneNumberId: "phone-id",
      whatsappVerifyToken: "verify-token",
      signalAccountNumber: "+15555550123",
    };

    pruneUnavailableTransports(next, notices);

    expect(next.transports).toEqual(["slack", "whatsapp", "signal"]);
    expect(notices).toEqual([]);
  });
});
