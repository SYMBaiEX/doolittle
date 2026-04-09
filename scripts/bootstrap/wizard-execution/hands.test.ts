import { describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";
import type { PromptHandle } from "../core/prompts";
import type { WizardAnswers } from "../types";
import { runExecutionHandsSelectionFlow } from "./hands";
import type { ExecutionHandsPromptDeps } from "./types";

const createContext = (): BootstrapWizardContext =>
  ({
    section: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
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

const createPromptDeps = () => {
  const chooseMany = mock(async <T extends string>() => [] as T[]);
  const chooseOne = mock(async () => "pair" as const);
  const ask = mock(async () => "");
  const askSecret = mock(async () => "");
  const askYesNo = mock(async () => false);

  return {
    chooseMany,
    chooseOne,
    ask,
    askSecret,
    askYesNo,
  } as unknown as ExecutionHandsPromptDeps;
};

describe("bootstrap execution hands flow", () => {
  it("keeps quick mode lean and preserves existing bindings", async () => {
    const context = createContext();
    const promptDeps = createPromptDeps();

    const result = await runExecutionHandsSelectionFlow(
      context,
      null as unknown as PromptHandle,
      new Map(),
      baseAnswers,
      promptDeps,
    );

    expect(result).toEqual({
      transports: [],
      pairingMode: "pair",
      allowAllUsers: false,
      telegramBotToken: "",
      discordBotToken: "",
      slackWebhookUrl: "",
      slackSigningSecret: "",
      homeAssistantUrl: "",
      homeAssistantToken: "",
      tools: {
        mcp: false,
        acp: false,
        tts: false,
        codegen: false,
      },
      mcpServerCommand: "",
      acpServerCommand: "",
      falApiKey: "",
      e2bApiKey: "",
      githubToken: "",
    });
    expect(context.section).toHaveBeenCalledTimes(1);
    expect(context.section).toHaveBeenCalledWith(
      "Hands",
      "Quick ignition keeps the toolkit lean and only preserves bindings you already had.",
    );
    expect(context.info).toHaveBeenCalledWith(
      "Preserving: mcp=no acp=no tts=no codegen=no.",
    );
    expect(promptDeps.chooseMany).not.toHaveBeenCalled();
    expect(promptDeps.chooseOne).not.toHaveBeenCalled();
    expect(promptDeps.askSecret).not.toHaveBeenCalled();
  });

  it("prompts ritual hands setup and uses preset bindings when selected", async () => {
    const context = createContext();
    const promptDeps = {
      chooseMany: mock(async () => ["telegram", "slack"] as const),
      chooseOne: mock(async (_context, _rl, prompt: string) => {
        if (prompt === "How should I greet new arrivals:") {
          return "allow" as const;
        }
        if (prompt === "How should I open my MCP bridge on first boot?") {
          return "filesystem" as const;
        }
        if (prompt === "How should I appear to ACP-aware editors?") {
          return "local-agent" as const;
        }
        throw new Error(`Unexpected prompt: ${prompt}`);
      }),
      ask: mock(async (_context, _rl, prompt: string) => {
        if (prompt === "Paste HOMEASSISTANT_URL") {
          return "https://home.example";
        }
        if (prompt === "What MCP server command should I speak through") {
          return "custom-mcp";
        }
        if (prompt === "What ACP server command should bind me to editors") {
          return "custom-acp";
        }
        throw new Error(`Unexpected prompt: ${prompt}`);
      }),
      askSecret: mock(async (_context, _rl, prompt: string) => {
        const values: Record<string, string> = {
          "Paste TELEGRAM_BOT_TOKEN": "telegram-token",
          "Paste SLACK_WEBHOOK_URL": "https://slack.example",
          "Paste SLACK_SIGNING_SECRET": "slack-secret",
          "Paste HOMEASSISTANT_TOKEN": "ha-token",
          "Paste FAL_API_KEY": "fal",
          "Paste E2B_API_KEY": "e2b",
          "Paste GITHUB_TOKEN": "gh",
        };
        const value = values[prompt];
        if (!value) {
          throw new Error(`Unexpected secret prompt: ${prompt}`);
        }
        return value;
      }),
      askYesNo: mock(async (_context, _rl, prompt: string) => {
        if (
          prompt === "Should I trust everyone on remote channels by default"
        ) {
          return true;
        }
        if (prompt === "Should I wake up with an MCP bridge already bound") {
          return true;
        }
        if (prompt === "Should I wake up with ACP and editor presence") {
          return true;
        }
        if (prompt === "Should I speak on first boot if you have a FAL key") {
          return true;
        }
        if (
          prompt === "Should I wake up with codegen, research, and E2B online"
        ) {
          return true;
        }
        throw new Error(`Unexpected yes/no prompt: ${prompt}`);
      }),
    } as unknown as ExecutionHandsPromptDeps;

    const result = await runExecutionHandsSelectionFlow(
      context,
      null as unknown as PromptHandle,
      new Map(),
      {
        ...baseAnswers,
        mode: "ritual",
        tools: {
          mcp: false,
          acp: false,
          tts: false,
          codegen: false,
        },
      },
      promptDeps,
    );

    expect(result.transports).toEqual(["telegram", "slack"]);
    expect(result.pairingMode).toBe("allow");
    expect(result.allowAllUsers).toBe(true);
    expect(result.telegramBotToken).toBe("telegram-token");
    expect(result.slackWebhookUrl).toBe("https://slack.example");
    expect(result.slackSigningSecret).toBe("slack-secret");
    expect(result.mcpServerCommand).toBe(
      "npx -y @modelcontextprotocol/server-filesystem .",
    );
    expect(result.acpServerCommand).toBe("doolittle api");
    expect(result.falApiKey).toBe("fal");
    expect(result.e2bApiKey).toBe("e2b");
    expect(result.githubToken).toBe("gh");
    expect(context.section).toHaveBeenCalledWith(
      "Channels",
      "Open the places where people and systems can reach me.",
    );
    expect(context.section).toHaveBeenCalledWith(
      "Hands",
      "Choose the tools, bridges, and protocols I should wake up holding.",
    );
  });
});
