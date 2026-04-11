import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../packages/agent/src/runtime/theme-catalog";
import { buildBootstrapPersistencePlan } from "./persistence/index";
import type { GatewayConfig, RuntimeSettings, WizardAnswers } from "./types";

const answers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "openai",
  backend: "ssh",
  browser: "basic",
  runDepth: "deep",
  maxIterations: 90,
  toolProgressMode: "all",
  pairingMode: "allow",
  allowAllUsers: true,
  transports: ["telegram", "slack"],
  tools: {
    mcp: true,
    acp: false,
    tts: true,
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
  slackWebhookUrl: "https://slack.example/webhook",
  slackSigningSecret: "slack-secret",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "npx -y @modelcontextprotocol/server-filesystem .",
  acpServerCommand: "",
  falApiKey: "fal-key",
  e2bApiKey: "",
  githubToken: "",
  sshHost: "ssh.example",
  sshUser: "bot",
  sshPath: "~/workspace",
  daytonaTarget: "",
  modalTarget: "",
};

const settings: RuntimeSettings = {
  model: {
    provider: "openai",
    model: "gpt-5.4",
    baseUrl: "https://api.openai.com/v1",
    temperature: 0.4,
    maxTokens: 1200,
  },
  gateway: {
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
  },
  execution: {
    backend: "local",
    remoteSyncMode: "mirror",
    remoteSyncInclude: ["**/*"],
    remoteSyncExclude: [],
    remoteArtifactPaths: [],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "workspace",
    dockerImage: "oven/bun:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: [],
    singularityImage: "",
    daytonaTarget: "",
    daytonaCommand: "",
    daytonaShell: "/bin/sh",
    daytonaWorkspacePath: "/workspace",
    daytonaSnapshot: "",
    daytonaBootstrapCommand: "",
    daytonaStatusCommand: "",
    daytonaInspectCommand: "",
    modalTarget: "",
    modalCommand: "",
    modalShell: "/bin/bash",
    modalWorkspacePath: "/workspace",
    modalEnvironment: "",
    modalBootstrapCommand: "",
    modalStatusCommand: "",
    modalInspectCommand: "",
    commandTimeoutMs: 30_000,
    healthTimeoutMs: 5_000,
    containerCpuLimit: "2",
    containerMemoryLimit: "2g",
    containerPidsLimit: 256,
    containerReadOnlyRoot: true,
    sshHost: "",
    sshUser: "",
    sshPath: "",
    sshPort: 22,
    sshKeyPath: "",
    sshStrictHostKeyChecking: false,
  },
  mcp: {
    serverCommand: "",
    timeoutMs: 10_000,
  },
  agent: {
    runDepth: "standard",
    maxIterations: 45,
    toolProgressMode: "new",
  },
  ui: {
    theme: DEFAULT_TUI_THEME,
  },
};

const gateway: GatewayConfig = {
  allowAllUsers: false,
  sessionTimeoutMinutes: 120,
  mirrorResponsesToHistory: true,
  platforms: {
    api: {
      enabled: true,
      allowedUserIds: [],
      pairingMode: "allow",
      allowAllUsers: true,
    },
    cli: {
      enabled: true,
      allowedUserIds: [],
      pairingMode: "allow",
      allowAllUsers: true,
    },
    telegram: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    discord: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    slack: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    whatsapp: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    signal: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    matrix: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    email: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    sms: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    mattermost: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    homeassistant: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
    dingtalk: {
      enabled: false,
      allowedUserIds: [],
      pairingMode: "pair",
    },
  },
};

describe("bootstrap persistence plan", () => {
  it("derives env updates, settings, gateway, and onboarding output from answers", () => {
    const plan = buildBootstrapPersistencePlan({
      answers,
      nativeOnboarding: {
        complete: true,
        currentStep: "SKILLS",
        summary: "ready",
      },
      nativeConnection: {
        kind: "linked",
        provider: "openai",
        detail: "connected",
      },
      settings,
      gateway,
      timestamp: "2026-03-29T12:00:00.000Z",
      mode: "quick",
    });

    expect(plan.envUpdates.DOOLITTLE_NAME).toBe("Doolittle");
    expect(plan.envUpdates.DOOLITTLE_EXECUTION_BACKEND).toBe("ssh");
    expect(plan.envUpdates.MCP_SERVER_COMMAND).toBe(
      "npx -y @modelcontextprotocol/server-filesystem .",
    );
    expect(plan.settings.execution.backend).toBe("ssh");
    expect(plan.settings.execution.sshHost).toBe("ssh.example");
    expect(plan.gateway.platforms.telegram.enabled).toBe(true);
    expect(plan.gateway.platforms.slack.enabled).toBe(true);
    expect(plan.onboarding.timestamp).toBe("2026-03-29T12:00:00.000Z");
    expect(plan.onboarding.nativeConnection.kind).toBe("linked");
    expect(plan.onboarding.profile).toHaveLength(12);
  });
});
