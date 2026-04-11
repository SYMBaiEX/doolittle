import { describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";
import type { PromptHandle } from "../core/prompts";
import type { ReviewResult, WizardAnswers } from "../types";
import { type ReviewFlowDeps, runReviewAndConfirmFlow } from "./review";

const baseAnswers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: "orange",
  provider: "offline",
  backend: "local",
  browser: "basic",
  runDepth: "quick",
  maxIterations: 15,
  toolProgressMode: "off",
  pairingMode: "pair",
  allowAllUsers: false,
  transports: [],
  tools: {
    mcp: false,
    acp: false,
    tts: false,
    codegen: false,
  },
  openaiApiKey: "",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "",
  elizaCloudModel: "",
  elizaCloudEmbeddingModel: "",
  anthropicApiKey: "",
  useLinkedClaudeCodeAuth: false,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "",
  anthropicModel: "claude-sonnet-4",
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

function createContext() {
  const appendLine = mock(() => {});
  const screen = { appendLine } as const;
  const context = {
    section: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    getWizardScreen: mock(() => screen),
  } as unknown as BootstrapWizardContext;
  return { context, appendLine };
}

function createDeps(result: ReviewResult, confirmed: boolean): ReviewFlowDeps {
  return {
    finalizeWizardAnswers: mock(() => result),
    summarizeAnswers: mock(() => ["summary-line"]),
    askYesNo: mock(async () => confirmed),
  };
}

const linkedAccounts = {
  codex: {
    provider: "codex",
    available: false,
    reusable: false,
    nativeReady: false,
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
  elizaCloud: {
    provider: "elizacloud",
    available: false,
    reusable: false,
    detail: "cloud",
  },
} as const;

describe("bootstrap wizard review flow", () => {
  it("returns finalized answers after confirmation and reports a clean review", async () => {
    const { context, appendLine } = createContext();
    const reviewed = { ...baseAnswers, provider: "openai" as const };
    const deps = createDeps(
      {
        answers: reviewed,
        notices: [],
      },
      true,
    );

    const result = await runReviewAndConfirmFlow(
      context,
      null as unknown as PromptHandle,
      baseAnswers,
      linkedAccounts,
      deps,
    );

    expect(result).toBe(reviewed);
    expect(context.section).toHaveBeenCalledWith(
      "Review",
      "I checked the final shape before writing it to disk.",
    );
    expect(context.info).toHaveBeenCalledWith("summary-line");
    expect(context.info).toHaveBeenCalledWith(
      "No blocking issues detected in the final setup state.",
    );
    expect(context.warn).not.toHaveBeenCalled();
    expect(appendLine).not.toHaveBeenCalled();
  });

  it("returns null and appends a restart message when confirmation is declined", async () => {
    const { context, appendLine } = createContext();
    const deps = createDeps(
      {
        answers: baseAnswers,
        notices: ["Heads up"],
      },
      false,
    );

    const result = await runReviewAndConfirmFlow(
      context,
      null as unknown as PromptHandle,
      baseAnswers,
      linkedAccounts,
      deps,
    );

    expect(result).toBeNull();
    expect(context.warn).toHaveBeenCalledWith("Heads up");
    expect(appendLine).toHaveBeenCalledWith(
      "Restarting the awakening so you can revise the configuration.",
    );
  });
});
