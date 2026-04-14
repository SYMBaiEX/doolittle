import { describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";
import type { PromptHandle } from "../prompting/types";
import type { WizardAnswers } from "../types";
import { resolveExecutionBodyDefaults } from "./body/defaults";
import { runExecutionBodySelectionFlow } from "./body/selection";
import type { ExecutionBodyPromptDeps } from "./body/types";

const createContext = (): BootstrapWizardContext =>
  ({
    section: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    abortBootstrap: () => {},
    raceBootstrapAbort: async <T>(operation: Promise<T>) => await operation,
    throwIfBootstrapAborted: () => {},
  }) as unknown as BootstrapWizardContext;

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

describe("bootstrap execution body helpers", () => {
  it("resolves the backend and browser defaults from environment and probes", () => {
    expect(
      resolveExecutionBodyDefaults(
        new Map([
          ["DOOLITTLE_EXECUTION_BACKEND", "ssh"],
          ["DOOLITTLE_BROWSER_PROVIDER", "lightpanda"],
        ]),
        [
          {
            key: "lightpanda",
            label: "Lightpanda",
            detail: "browser automation",
            installed: true,
          },
        ],
      ),
    ).toEqual({
      backend: "ssh",
      browser: "lightpanda",
    });
  });

  it("falls back to local and basic when the browser probe is unavailable", () => {
    expect(resolveExecutionBodyDefaults(new Map(), [])).toEqual({
      backend: "local",
      browser: "basic",
    });
  });

  it("falls back to basic browser after warning in ritual mode when Lightpanda is unavailable", async () => {
    const context = createContext();
    const promptDeps = {
      chooseOne: mock(async (_context, _rl, prompt: string) => {
        if (prompt === "Where should I execute:") {
          return "local" as const;
        }
        if (prompt === "Choose my eyes:") {
          return "lightpanda" as const;
        }
        throw new Error(`Unexpected prompt: ${prompt}`);
      }),
      ask: mock(async () => ""),
      askYesNo: mock(async () => true),
    } as unknown as ExecutionBodyPromptDeps;

    const result = await runExecutionBodySelectionFlow(
      context,
      null as unknown as PromptHandle,
      new Map(),
      [
        {
          key: "lightpanda",
          label: "Lightpanda",
          detail: "browser automation",
          installed: false,
        },
      ],
      {
        ...baseAnswers,
        mode: "ritual",
      },
      promptDeps,
    );

    expect(result).toEqual({
      backend: "local",
      browser: "basic",
      sshHost: "",
      sshUser: "",
      sshPath: "",
      daytonaTarget: "",
      modalTarget: "",
    });
    expect(context.warn).toHaveBeenCalledWith(
      "Lightpanda is not installed yet. Basic HTTP is safer until you add it.",
    );
    expect(promptDeps.askYesNo).toHaveBeenCalledTimes(1);
  });

  it("collects SSH target details during ritual mode and assembles the final selection", async () => {
    const context = createContext();
    const promptDeps = {
      chooseOne: mock(async (_context, _rl, prompt: string) => {
        if (prompt === "Where should I execute:") {
          return "ssh" as const;
        }
        if (prompt === "Choose my eyes:") {
          return "basic" as const;
        }
        throw new Error(`Unexpected prompt: ${prompt}`);
      }),
      ask: mock(async (_context, _rl, prompt: string) => {
        const values: Record<string, string> = {
          "What host should I inhabit over SSH": "buildbox.internal",
          "Which SSH user should I become": "deploy",
          "What workspace path should I wake up inside": "/srv/doolittle",
        };
        const value = values[prompt];
        if (!value) {
          throw new Error(`Unexpected prompt: ${prompt}`);
        }
        return value;
      }),
      askYesNo: mock(async () => true),
    } as unknown as ExecutionBodyPromptDeps;

    const result = await runExecutionBodySelectionFlow(
      context,
      null as unknown as PromptHandle,
      new Map(),
      [],
      {
        ...baseAnswers,
        mode: "ritual",
        sshHost: "old-host",
        sshUser: "old-user",
      },
      promptDeps,
    );

    expect(result).toEqual({
      backend: "ssh",
      browser: "basic",
      sshHost: "buildbox.internal",
      sshUser: "deploy",
      sshPath: "/srv/doolittle",
      daytonaTarget: "",
      modalTarget: "",
    });
    expect(context.section).toHaveBeenCalledWith(
      "Body",
      "Choose where I should live and act.",
    );
  });
});
