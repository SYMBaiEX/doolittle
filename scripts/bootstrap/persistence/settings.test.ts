import { describe, expect, it } from "bun:test";
import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import type { RuntimeSettings, WizardAnswers } from "../types";
import { buildBootstrapSettings } from "./settings";

const answers: WizardAnswers = {
  mode: "quick",
  agentName: "Doolittle",
  timezone: "America/Chicago",
  theme: DEFAULT_TUI_THEME,
  provider: "claude-code",
  backend: "ssh",
  browser: "lightpanda",
  runDepth: "deep",
  maxIterations: 90,
  toolProgressMode: "all",
  pairingMode: "allow",
  allowAllUsers: true,
  transports: ["telegram"],
  tools: {
    mcp: true,
    acp: true,
    tts: false,
    codegen: true,
  },
  openaiApiKey: "",
  useLinkedCodexAuth: false,
  openaiModel: "gpt-5.4",
  elizaCloudApiKey: "",
  elizaCloudEnabled: false,
  elizaCloudSmallModel: "small",
  elizaCloudModel: "large",
  elizaCloudEmbeddingModel: "embedding",
  anthropicApiKey: "anthropic-key",
  useLinkedClaudeCodeAuth: true,
  claudeCodeCliFallback: false,
  claudeCodeOauthToken: "token",
  anthropicModel: "claude-sonnet-4.6",
  telegramBotToken: "telegram-token",
  discordBotToken: "",
  slackWebhookUrl: "",
  slackSigningSecret: "",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  mcpServerCommand: "mcp-server",
  acpServerCommand: "acp-server",
  falApiKey: "",
  e2bApiKey: "e2b-key",
  githubToken: "github-key",
  sshHost: "ssh-host",
  sshUser: "ssh-user",
  sshPath: "/workspace",
  daytonaTarget: "daytona-target",
  modalTarget: "",
};

const settings: RuntimeSettings = {
  model: {
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    temperature: 0.2,
    maxTokens: 500,
  },
  gateway: {
    sessionTimeoutMinutes: 55,
    mirrorResponsesToHistory: false,
  },
  execution: {
    backend: "local",
    remoteSyncMode: "snapshot",
    remoteSyncInclude: ["src/**/*"],
    remoteSyncExclude: ["dist"],
    remoteArtifactPaths: ["artifacts"],
    remoteArtifactPolicy: "allowlisted",
    remoteWorkspaceLabel: "custom-workspace",
    dockerImage: "custom-image",
    dockerNetwork: "bridge",
    dockerWorkspacePath: "/app",
    dockerEnvPassthrough: ["PATH"],
    singularityImage: "singularity.img",
    daytonaTarget: "old-daytona",
    daytonaCommand: "daytona",
    daytonaShell: "/bin/bash",
    daytonaWorkspacePath: "/app",
    daytonaSnapshot: "snapshot",
    daytonaBootstrapCommand: "bootstrap",
    daytonaStatusCommand: "status",
    daytonaInspectCommand: "inspect",
    modalTarget: "old-modal",
    modalCommand: "modal",
    modalShell: "/bin/zsh",
    modalWorkspacePath: "/app",
    modalEnvironment: "prod",
    modalBootstrapCommand: "bootstrap-modal",
    modalStatusCommand: "status-modal",
    modalInspectCommand: "inspect-modal",
    commandTimeoutMs: 15_000,
    healthTimeoutMs: 2_000,
    containerCpuLimit: "1",
    containerMemoryLimit: "1g",
    containerPidsLimit: 128,
    containerReadOnlyRoot: false,
    sshHost: "old-host",
    sshUser: "old-user",
    sshPath: "/old",
    sshPort: 2222,
    sshKeyPath: "/keys/id",
    sshStrictHostKeyChecking: true,
  },
  mcp: {
    serverCommand: "old-mcp",
    timeoutMs: 5_000,
  },
  agent: {
    runDepth: "quick",
    maxIterations: 12,
    toolProgressMode: "off",
  },
  ui: {
    theme: DEFAULT_TUI_THEME,
  },
};

describe("bootstrap persistence settings", () => {
  it("projects wizard answers into runtime settings without changing unrelated values", () => {
    const next = buildBootstrapSettings(settings, answers);

    expect(next.ui.theme).toBe(DEFAULT_TUI_THEME);
    expect(next.agent.runDepth).toBe("deep");
    expect(next.agent.maxIterations).toBe(90);
    expect(next.agent.toolProgressMode).toBe("all");
    expect(next.execution.backend).toBe("ssh");
    expect(next.execution.sshHost).toBe("ssh-host");
    expect(next.execution.sshUser).toBe("ssh-user");
    expect(next.execution.sshPath).toBe("/workspace");
    expect(next.execution.daytonaTarget).toBe("");
    expect(next.execution.modalTarget).toBe("");
    expect(next.mcp.serverCommand).toBe("mcp-server");
    expect(next.model.provider).toBe("claude-code");
    expect(next.model.model).toBe("claude-sonnet-4.6");
    expect(next.model.baseUrl).toBe("");
    expect(next.gateway.sessionTimeoutMinutes).toBe(55);
    expect(next.gateway.mirrorResponsesToHistory).toBe(false);
  });
});
