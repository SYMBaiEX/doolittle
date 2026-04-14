import { afterEach, describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../../bootstrap-context";
import type { WizardAnswers } from "../../types";

function createAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return {
    mode: "ritual",
    agentName: "Doolittle",
    timezone: "America/Chicago",
    theme: "orange",
    provider: "offline",
    backend: "local",
    browser: "lightpanda",
    runDepth: "standard",
    maxIterations: 8,
    toolProgressMode: "new",
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
    openaiModel: "",
    elizaCloudApiKey: "",
    elizaCloudEnabled: false,
    elizaCloudSmallModel: "gpt-5.4-mini",
    elizaCloudModel: "gpt-5.4",
    elizaCloudEmbeddingModel: "text-embedding-3-large",
    anthropicApiKey: "",
    useLinkedClaudeCodeAuth: false,
    claudeCodeCliFallback: false,
    claudeCodeOauthToken: "",
    anthropicModel: "",
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
    ...overrides,
  };
}

function createContext() {
  const infoMessages: string[] = [];
  const sections: Array<{ title: string; detail: string }> = [];
  const context = {
    root: "/tmp/doolittle",
    options: {
      headless: false,
      skipWizard: false,
    },
    banner: () => undefined,
    section: (title: string, detail: string) => {
      sections.push({ title, detail });
    },
    info: (message: string) => {
      infoMessages.push(message);
    },
    warn: () => undefined,
    formatKeyLabel: (label: string) => label,
    getWizardScreen: () => null,
    setWizardScreen: () => undefined,
    abortBootstrap: () => undefined,
    raceBootstrapAbort: async <T>(operation: Promise<T>) => operation,
    throwIfBootstrapAborted: () => undefined,
  } satisfies BootstrapWizardContext;

  return { context, infoMessages, sections };
}

function createLinkedAccounts(overrides: Record<string, unknown> = {}) {
  return {
    codex: {
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
    },
    claudeCode: {
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
    },
    elizaCloud: {
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
    },
    ...overrides,
  } as const;
}

async function loadFlowModule() {
  return import(`./flow?flow-test=${Date.now()}-${Math.random()}`);
}

describe("provider selection flow", () => {
  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("carries forward linked codex auth and only prompts for the model", async () => {
    const ask = mock(async () => "gpt-5.4-codex");
    const askSecret = mock(async () => {
      throw new Error("askSecret should not run for linked codex selection");
    });
    const chooseOne = mock(async () => "codex");
    const branchCalls: string[] = [];

    mock.module("../../core/prompt-ops", () => ({
      ask,
      askSecret,
      chooseOne,
    }));
    mock.module("../../wizard/state", () => ({
      resolveInteractiveProviderDefault: () => "codex",
    }));
    mock.module("./branches/eliza-cloud", () => ({
      runElizaCloudProviderBranch: mock(async ({ linkedAccounts }: never) => {
        branchCalls.push("elizacloud");
        return linkedAccounts;
      }),
    }));
    mock.module("./branches/codex", () => ({
      runCodexProviderBranch: mock(
        async ({
          linkedAccounts,
          state,
        }: {
          linkedAccounts: unknown;
          state: { useLinkedCodexAuth: boolean };
        }) => {
          branchCalls.push(`codex:${state.useLinkedCodexAuth}`);
          return linkedAccounts;
        },
      ),
    }));
    mock.module("./branches/claude-code", () => ({
      runClaudeCodeProviderBranch: mock(async ({ linkedAccounts }: never) => {
        branchCalls.push("claude-code");
        return linkedAccounts;
      }),
    }));

    const { runProviderSelectionFlow } = await loadFlowModule();
    const { context, sections } = createContext();
    const answers = createAnswers();
    const linkedAccounts = createLinkedAccounts({
      codex: {
        nativeReady: true,
        reusable: true,
        fallbackReady: false,
      },
    });

    const result = await runProviderSelectionFlow(
      context,
      {} as never,
      new Map(),
      answers,
      linkedAccounts,
    );

    expect(result).toBe(linkedAccounts);
    expect(sections[0]).toEqual({
      title: "Mind",
      detail: "I need a mind to think with.",
    });
    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(askSecret).not.toHaveBeenCalled();
    expect(branchCalls).toEqual(["elizacloud", "codex:true", "claude-code"]);
    expect(answers.provider).toBe("codex");
    expect(answers.useLinkedCodexAuth).toBe(true);
    expect(answers.openaiModel).toBe("gpt-5.4-codex");
  });

  it("collects both provider credentials for hybrid mode", async () => {
    const askPrompts: string[] = [];
    const secretPrompts: string[] = [];
    const ask = mock(
      async (
        _context: unknown,
        _rl: unknown,
        prompt: string,
        currentValue: string,
      ) => {
        askPrompts.push(prompt);
        if (prompt.includes("OpenAI")) {
          return "gpt-5.4";
        }
        if (prompt.includes("Anthropic")) {
          return "claude-sonnet-4";
        }
        return currentValue;
      },
    );
    const askSecret = mock(
      async (_context: unknown, _rl: unknown, prompt: string) => {
        secretPrompts.push(prompt);
        return prompt.includes("OPENAI") ? "openai-key" : "anthropic-key";
      },
    );
    const chooseOne = mock(async () => "hybrid");

    mock.module("../../core/prompt-ops", () => ({
      ask,
      askSecret,
      chooseOne,
    }));
    mock.module("../../wizard/state", () => ({
      resolveInteractiveProviderDefault: () => "openai",
    }));
    mock.module("./branches/eliza-cloud", () => ({
      runElizaCloudProviderBranch: mock(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    mock.module("./branches/codex", () => ({
      runCodexProviderBranch: mock(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    mock.module("./branches/claude-code", () => ({
      runClaudeCodeProviderBranch: mock(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));

    const { runProviderSelectionFlow } = await loadFlowModule();
    const { context } = createContext();
    const answers = createAnswers();

    await runProviderSelectionFlow(
      context,
      {} as never,
      new Map(),
      answers,
      createLinkedAccounts(),
    );

    expect(secretPrompts).toEqual([
      "Paste OPENAI_API_KEY",
      "Paste ANTHROPIC_API_KEY",
    ]);
    expect(askPrompts).toEqual([
      "Which OpenAI model should lead my first sessions",
      "Which Anthropic model should lead my first sessions",
    ]);
    expect(answers.provider).toBe("hybrid");
    expect(answers.openaiApiKey).toBe("openai-key");
    expect(answers.anthropicApiKey).toBe("anthropic-key");
    expect(answers.openaiModel).toBe("gpt-5.4");
    expect(answers.anthropicModel).toBe("claude-sonnet-4");
  });
});
