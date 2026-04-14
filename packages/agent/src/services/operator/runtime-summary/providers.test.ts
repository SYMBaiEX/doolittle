import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types";
import { buildProviderSummaries } from "./providers";
import type { LinkedAccounts } from "./types";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    agentName: "Doolittle",
    mode: "cli",
    host: "127.0.0.1",
    port: 3456,
    dataDir: "/tmp/data",
    skillsDir: "/tmp/skills",
    timezone: "America/Chicago",
    elizaCloudApiKey: undefined,
    elizaCloudEnabled: false,
    elizaCloudBaseUrl: "https://www.elizacloud.ai/api/v1",
    elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
    elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
    elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
    openAiApiKey: undefined,
    offlineBootstrapMode: false,
    useLinkedCodexAuth: false,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-5.4",
    openAiImageModel: "gpt-image-1",
    openAiTemperature: 0.2,
    openAiMaxTokens: 4096,
    anthropicApiKey: undefined,
    useLinkedClaudeCodeAuth: false,
    claudeCodeCliFallback: false,
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-haiku-4-5-20251001",
    anthropicLargeModel: "claude-sonnet-4.6",
    telegramBotToken: undefined,
    telegramApiRoot: undefined,
    telegramAllowedChats: undefined,
    discordBotToken: undefined,
    slackWebhookUrl: undefined,
    slackSigningSecret: undefined,
    whatsappAccessToken: undefined,
    whatsappPhoneNumberId: undefined,
    whatsappVerifyToken: undefined,
    signalCliCommand: undefined,
    matrixHomeserver: undefined,
    matrixAccessToken: undefined,
    emailSendCommand: undefined,
    falApiKey: undefined,
    smsSendCommand: undefined,
    mattermostUrl: undefined,
    mattermostToken: undefined,
    homeAssistantUrl: undefined,
    homeAssistantToken: undefined,
    dingtalkWebhookUrl: undefined,
    dingtalkAccessToken: undefined,
    browserProvider: "basic",
    browserCommand: "lightpanda",
    browserCdpUrl: undefined,
    browserObeyRobots: true,
    remoteSyncMode: "mirror",
    remoteSyncInclude: ["**/*"],
    remoteSyncExclude: [".git", ".doolittle"],
    remoteArtifactPaths: [".doolittle/remote-artifacts"],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "doolittle-workspace",
    executionBackend: "local",
    dockerImage: "oven/bun:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: [],
    singularityImage: "",
    daytonaTarget: undefined,
    daytonaCommand: undefined,
    daytonaShell: undefined,
    daytonaWorkspacePath: undefined,
    daytonaSnapshot: undefined,
    daytonaBootstrapCommand: undefined,
    daytonaStatusCommand: undefined,
    daytonaInspectCommand: undefined,
    modalTarget: undefined,
    modalCommand: undefined,
    modalShell: undefined,
    modalWorkspacePath: undefined,
    modalEnvironment: undefined,
    modalBootstrapCommand: undefined,
    modalStatusCommand: undefined,
    modalInspectCommand: undefined,
    executionCommandTimeoutMs: 120000,
    executionHealthTimeoutMs: 15000,
    containerCpuLimit: "2",
    containerMemoryLimit: "4g",
    containerPidsLimit: 512,
    containerReadOnlyRoot: false,
    sshHost: undefined,
    sshUser: undefined,
    sshPath: undefined,
    sshPort: 22,
    sshKeyPath: undefined,
    sshStrictHostKeyChecking: true,
    mcpServerCommand: undefined,
    mcpTimeoutMs: 30000,
    acpServerCommand: undefined,
    acpTimeoutMs: 30000,
    memoryCharLimit: 100000,
    userCharLimit: 50000,
    sessionSearchLimit: 20,
    cronTickSeconds: 30,
    cronOutputDir: "/tmp/cron-output",
    gatewayDataDir: "/tmp/gateway",
    hooksDir: "/tmp/hooks",
    workspaceDir: "/tmp/workspace",
    allowAllUsers: true,
    pairingDefaultMode: "allow",
    runDepth: "standard",
    toolProgressMode: "new",
    maxIterations: 30,
    ...overrides,
  };
}

function createLinkedAccounts(
  overrides: Partial<LinkedAccounts> = {},
): LinkedAccounts {
  return {
    codex: {
      provider: "codex",
      available: false,
      reusable: false,
      nativeReady: false,
      detail: "No reusable Codex account is linked.",
    },
    claudeCode: {
      provider: "claude-code",
      available: false,
      reusable: false,
      nativeReady: false,
      fallbackReady: false,
      detail: "No reusable Claude Code account is linked.",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      reusable: false,
      detail: "No reusable ElizaCloud account is linked.",
    },
    ...overrides,
  };
}

describe("buildProviderSummaries", () => {
  it("reports linked native accounts and API-backed providers as ready", () => {
    const rows = buildProviderSummaries(
      createConfig({
        openAiApiKey: "openai-key",
        anthropicApiKey: "anthropic-key",
      }),
      createLinkedAccounts({
        codex: {
          provider: "codex",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "Codex linked",
        },
        claudeCode: {
          provider: "claude-code",
          available: true,
          reusable: true,
          nativeReady: true,
          fallbackReady: true,
          detail: "Claude linked",
        },
      }),
    );

    expect(rows).toEqual([
      {
        id: "codex",
        ready: true,
        detail: "Linked Codex account is ready for Codex-native workflows.",
      },
      {
        id: "claude-code",
        ready: true,
        detail:
          "Linked Claude Code account is ready for Claude-native workflows.",
      },
      {
        id: "openai",
        ready: true,
        detail: "Configured for gpt-5.4.",
      },
      {
        id: "anthropic",
        ready: true,
        detail: "Configured for claude-sonnet-4.6.",
      },
    ]);
  });

  it("surfaces fallback and missing-key detail truthfully", () => {
    const rows = buildProviderSummaries(
      createConfig(),
      createLinkedAccounts({
        codex: {
          provider: "codex",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "Codex linked",
        },
        claudeCode: {
          provider: "claude-code",
          available: true,
          reusable: false,
          nativeReady: false,
          fallbackReady: true,
          detail: "Claude fallback available",
        },
      }),
    );

    expect(rows).toEqual([
      {
        id: "codex",
        ready: true,
        detail: "Linked Codex account is ready for Codex-native workflows.",
      },
      {
        id: "claude-code",
        ready: false,
        detail:
          "Claude Code local CLI fallback is available, but native Eliza auth is not fully bound yet.",
      },
      {
        id: "openai",
        ready: false,
        detail:
          "No OPENAI_API_KEY is set. A linked Codex account is available for Codex-native workflows, but the OpenAI provider path still needs an API key.",
      },
      {
        id: "anthropic",
        ready: false,
        detail: "Missing ANTHROPIC_API_KEY.",
      },
    ]);
  });
});
