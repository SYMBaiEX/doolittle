import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types";
import { applyMissingExecutionDefaults } from "./execution-defaults";
import type { RuntimeSettingsSnapshot } from "./types";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    gatewayDataDir: "/tmp/doolittle-gateway",
    workspaceDir: "/tmp/workspace",
    skillsDir: "/tmp/skills",
    hooksDir: "/tmp/hooks",
    cronOutputDir: "/tmp/cron",
    timezone: "America/Chicago",
    memoryCharLimit: 10_000,
    userCharLimit: 4_000,
    openAiApiKey: "",
    openAiModel: "gpt-5.4-mini",
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiImageModel: "gpt-image-1",
    openAiTemperature: 0.2,
    openAiMaxTokens: 400,
    anthropicApiKey: "",
    anthropicLargeModel: "claude-sonnet-4.7",
    anthropicBaseUrl: "https://api.anthropic.com",
    elizaCloudEnabled: false,
    elizaCloudApiKey: "",
    elizaCloudBaseUrl: "https://api.eliza.cloud",
    elizaCloudSmallModel: "xai/grok-4.1-fast-non-reasoning-beta",
    elizaCloudLargeModel: "xai/grok-4.1-fast-reasoning-beta",
    useLinkedClaudeCodeAuth: false,
    useLinkedCodexAuth: false,
    executionBackend: "local",
    remoteSyncMode: "mirror",
    remoteSyncInclude: ["src/**/*"],
    remoteSyncExclude: [".git"],
    remoteArtifactPaths: [".doolittle/remote-artifacts"],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "remote:workspace",
    dockerImage: "oven/bun:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: ["PATH"],
    singularityImage: "",
    daytonaTarget: "sandbox-dev",
    daytonaCommand: "daytona",
    daytonaShell: "/bin/sh",
    daytonaWorkspacePath: "/workspace",
    daytonaSnapshot: "",
    daytonaBootstrapCommand: "",
    daytonaStatusCommand: "",
    daytonaInspectCommand: "",
    modalTarget: "sandbox-prod",
    modalCommand: "modal",
    modalShell: "/bin/bash",
    modalWorkspacePath: "/workspace",
    modalEnvironment: "prod",
    modalBootstrapCommand: "",
    modalStatusCommand: "",
    modalInspectCommand: "",
    executionCommandTimeoutMs: 30_000,
    executionHealthTimeoutMs: 5_000,
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
    mcpServerCommand: "bun run mcp",
    mcpTimeoutMs: 5_000,
    runDepth: "standard",
    maxIterations: 45,
    toolProgressMode: "new",
    browserProvider: "lightpanda",
    browserCommand: "",
    browserCdpUrl: "",
    browserObeyRobots: true,
    falApiKey: "",
    cronTickSeconds: 60,
    ...overrides,
  } as EnvConfig;
}
function createCurrentSettings(): RuntimeSettingsSnapshot {
  return {
    model: {
      provider: "offline",
      model: "offline",
      baseUrl: "",
      temperature: 0.2,
      maxTokens: 400,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "",
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "",
      remoteWorkspaceLabel: "",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "",
      dockerWorkspacePath: "",
      dockerEnvPassthrough: [],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "",
      daytonaWorkspacePath: "",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "",
      modalWorkspacePath: "",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 0,
      healthTimeoutMs: 0,
      containerCpuLimit: "",
      containerMemoryLimit: "",
      containerPidsLimit: 0,
      containerReadOnlyRoot: undefined,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 0,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 0,
    },
    agent: {
      runDepth: "standard",
      maxIterations: 45,
      toolProgressMode: "new",
    },
    ui: {
      theme: "orange",
    },
  } as unknown as RuntimeSettingsSnapshot;
}
describe("applyMissingExecutionDefaults", () => {
  it("hydrates empty execution and mcp settings from env config", () => {
    const updates: Array<[string, unknown]> = [];

    applyMissingExecutionDefaults(createConfig(), createCurrentSettings(), ((
      path: string,
      value: unknown,
    ) => {
      updates.push([path, value]);
    }) as never);

    expect(updates).toContainEqual(["execution.remoteSyncMode", "mirror"]);
    expect(updates).toContainEqual(["execution.modalEnvironment", "prod"]);
    expect(updates).toContainEqual(["execution.sshPort", 22]);
    expect(updates).toContainEqual(["mcp.serverCommand", "bun run mcp"]);
  });

  it("preserves existing configured values", () => {
    const currentSettings = createCurrentSettings();
    currentSettings.execution.remoteSyncMode = "snapshot";
    currentSettings.execution.modalEnvironment = "staging";
    currentSettings.execution.sshPort = 2200;
    currentSettings.mcp.serverCommand = "existing-mcp";
    const updates: Array<[string, unknown]> = [];

    applyMissingExecutionDefaults(createConfig(), currentSettings, ((
      path: string,
      value: unknown,
    ) => {
      updates.push([path, value]);
    }) as never);

    expect(updates).not.toContainEqual(["execution.remoteSyncMode", "mirror"]);
    expect(updates).not.toContainEqual(["execution.modalEnvironment", "prod"]);
    expect(updates).not.toContainEqual(["execution.sshPort", 22]);
    expect(updates).not.toContainEqual(["mcp.serverCommand", "bun run mcp"]);
  });
});
