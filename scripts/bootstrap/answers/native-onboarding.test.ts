import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { WizardAnswers } from "../types";

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
  transports: ["telegram", "matrix"],
  tools: {
    mcp: true,
    acp: false,
    tts: false,
    codegen: false,
  },
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
  slackWebhookUrl: "",
  slackSigningSecret: "",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "npx mcp",
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

function installSuccessMocks() {
  const advanceStep = mock(async () => {});
  const machine = {
    advanceStep,
    getContext: () => ({ state: "ready" }),
    getCurrentStep: () => "SKILLS",
    toJSON: () => ({ payload: "mirror" }),
  };

  mock.module("@elizaos/core", () => ({
    createOnboardingStateMachine: () => machine,
    OnboardingStep: {
      WELCOME: "WELCOME",
      RISK_ACK: "RISK_ACK",
      AUTH: "AUTH",
      CHANNELS: "CHANNELS",
      SKILLS: "SKILLS",
    },
    isOnboardingComplete: () => true,
    getOnboardingSummary: () => "mirror-summary",
  }));

  return {
    advanceStep,
    machine,
  };
}

function installFailureMocks(error: string) {
  const advanceStep = mock(async (payload: { step: string }) => {
    if (payload.step === "RISK_ACK") {
      throw new Error(error);
    }
  });
  const machine = {
    advanceStep,
    getContext: () => ({}),
    getCurrentStep: () => "WELCOME",
    toJSON: () => ({}),
  };

  mock.module("@elizaos/core", () => ({
    createOnboardingStateMachine: () => machine,
    OnboardingStep: {
      WELCOME: "WELCOME",
      RISK_ACK: "RISK_ACK",
      AUTH: "AUTH",
      CHANNELS: "CHANNELS",
      SKILLS: "SKILLS",
    },
    isOnboardingComplete: () => false,
    getOnboardingSummary: () => "summary",
  }));

  return { advanceStep, machine };
}

beforeEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("bootstrap native onboarding mirror", () => {
  it("builds a serializable, complete mirror for valid answer input", async () => {
    const { advanceStep } = installSuccessMocks();
    const { buildNativeOnboardingMirror } = await import(
      `./native-onboarding?native-onboarding-success=${Date.now()}-${Math.random()}`
    );

    const mirror = await buildNativeOnboardingMirror(baseAnswers, "cli");

    expect(mirror.complete).toBe(true);
    expect(mirror.currentStep).toBe("SKILLS");
    expect(mirror.summary).toBe("mirror-summary");
    expect(mirror.serialized).toEqual({ payload: "mirror" });
    expect(advanceStep).toHaveBeenCalledTimes(5);
    expect(advanceStep).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "WELCOME",
        data: {
          acknowledged: true,
          userName: "Doolittle",
        },
      }),
    );
    expect(advanceStep).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "SKILLS",
        data: expect.objectContaining({
          skills: ["mcp", "run-depth:quick", "tool-progress:off"],
        }),
      }),
    );
  });

  it("returns a graceful failure result when machine steps throw", async () => {
    installFailureMocks("state-machine unavailable");
    const { buildNativeOnboardingMirror } = await import(
      `./native-onboarding?native-onboarding-failure=${Date.now()}-${Math.random()}`
    );

    const mirror = await buildNativeOnboardingMirror(baseAnswers, "wizard");

    expect(mirror.complete).toBe(false);
    expect(mirror.currentStep).toBe("ERROR");
    expect(mirror.summary).toBe(
      "Native onboarding mirror unavailable: state-machine unavailable",
    );
    expect(mirror.serialized).toBeUndefined();
  });
});
