import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
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
    ollamaApiEndpoint: "http://localhost:11434/api",
    ollamaSmallModel: "granite4.1:3b",
    ollamaLargeModel: "granite4.1:3b",
    ollamaEmbeddingModel: "nomic-embed-text:latest",
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

function createLinkedAccounts(
  overrides: {
    [Key in keyof LinkedProviderAccountsSnapshot]?: Partial<
      LinkedProviderAccountsSnapshot[Key]
    >;
  } = {},
): LinkedProviderAccountsSnapshot {
  const defaults: LinkedProviderAccountsSnapshot = {
    codex: {
      provider: "codex",
      available: false,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "Codex not linked",
    },
    claudeCode: {
      provider: "claude-code",
      available: false,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "Claude Code not linked",
    },
    devin: {
      provider: "devin",
      available: false,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "Devin not linked",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "Eliza Cloud not linked",
    },
  };
  return {
    codex: { ...defaults.codex, ...overrides.codex },
    claudeCode: { ...defaults.claudeCode, ...overrides.claudeCode },
    devin: { ...defaults.devin, ...overrides.devin },
    elizaCloud: { ...defaults.elizaCloud, ...overrides.elizaCloud },
  };
}

async function loadFlowModule() {
  return import("./flow");
}

describe("provider selection flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("carries forward linked codex auth and only prompts for the model", async () => {
    const ask = vi.fn(async () => "gpt-5.4-codex");
    const askSecret = vi.fn(async () => {
      throw new Error("askSecret should not run for linked codex selection");
    });
    const chooseOne = vi.fn(async () => "codex");
    const branchCalls: string[] = [];

    vi.doMock("../../core/prompt-ops", () => ({
      ask,
      askYesNo: vi.fn(async () => true),
      askSecret,
      chooseOne,
    }));
    vi.doMock("../../wizard/state", () => ({
      resolveInteractiveProviderDefault: () => "codex",
    }));
    vi.doMock("./branches/eliza-cloud", () => ({
      runElizaCloudProviderBranch: vi.fn(async ({ linkedAccounts }: never) => {
        branchCalls.push("elizacloud");
        return linkedAccounts;
      }),
    }));
    vi.doMock("./branches/codex", () => ({
      runCodexProviderBranch: vi.fn(
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
    vi.doMock("./branches/claude-code", () => ({
      runClaudeCodeProviderBranch: vi.fn(async ({ linkedAccounts }: never) => {
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
    const ask = vi.fn(
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
    const askSecret = vi.fn(
      async (_context: unknown, _rl: unknown, prompt: string) => {
        secretPrompts.push(prompt);
        return prompt.includes("OPENAI") ? "openai-key" : "anthropic-key";
      },
    );
    const chooseOne = vi.fn(async () => "hybrid");

    vi.doMock("../../core/prompt-ops", () => ({
      ask,
      askYesNo: vi.fn(async () => true),
      askSecret,
      chooseOne,
    }));
    vi.doMock("../../wizard/state", () => ({
      resolveInteractiveProviderDefault: () => "openai",
    }));
    vi.doMock("./branches/eliza-cloud", () => ({
      runElizaCloudProviderBranch: vi.fn(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    vi.doMock("./branches/codex", () => ({
      runCodexProviderBranch: vi.fn(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    vi.doMock("./branches/claude-code", () => ({
      runClaudeCodeProviderBranch: vi.fn(
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

  it("collects local Ollama endpoint and model routing without provider secrets", async () => {
    const askPrompts: string[] = [];
    const ask = vi.fn(
      async (
        _context: unknown,
        _rl: unknown,
        prompt: string,
        currentValue: string,
      ) => {
        askPrompts.push(prompt);
        if (prompt.includes("endpoint")) {
          return "http://127.0.0.1:11434/api";
        }
        if (prompt.includes("small")) {
          return "qwen2.5-coder:7b";
        }
        if (prompt.includes("large")) {
          return "llama3.3:70b";
        }
        if (prompt.includes("embedding")) {
          return "nomic-embed-text:latest";
        }
        return currentValue;
      },
    );
    const askSecret = vi.fn(async () => {
      throw new Error("askSecret should not run for local Ollama selection");
    });
    const chooseOne = vi.fn(async () => "ollama");

    vi.doMock("../../core/prompt-ops", () => ({
      ask,
      askYesNo: vi.fn(async () => true),
      askSecret,
      chooseOne,
    }));
    vi.doMock("../../wizard/state", () => ({
      resolveInteractiveProviderDefault: () => "ollama",
    }));
    vi.doMock("./branches/eliza-cloud", () => ({
      runElizaCloudProviderBranch: vi.fn(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    vi.doMock("./branches/codex", () => ({
      runCodexProviderBranch: vi.fn(
        async ({ linkedAccounts }: never) => linkedAccounts,
      ),
    }));
    vi.doMock("./branches/claude-code", () => ({
      runClaudeCodeProviderBranch: vi.fn(
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

    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledTimes(4);
    expect(askSecret).not.toHaveBeenCalled();
    expect(askPrompts).toEqual([
      "Which Ollama API endpoint should I use",
      "Which local small model should I use",
      "Which local large model should lead my first sessions",
      "Which local embedding model should I use",
    ]);
    expect(answers.provider).toBe("ollama");
    expect(answers.ollamaApiEndpoint).toBe("http://127.0.0.1:11434/api");
    expect(answers.ollamaSmallModel).toBe("qwen2.5-coder:7b");
    expect(answers.ollamaLargeModel).toBe("llama3.3:70b");
    expect(answers.ollamaEmbeddingModel).toBe("nomic-embed-text:latest");
  });
});
