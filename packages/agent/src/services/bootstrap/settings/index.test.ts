import { describe, expect, it } from "bun:test";
import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { EnvConfig } from "@/types";
import { applyServiceSettingsBootstrap } from "./index";

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
    remoteSyncInclude: ["**/*"],
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
    modalEnvironment: "",
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
    mcpServerCommand: "",
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

function createCurrentSettings() {
  return {
    model: {
      provider: "offline",
      model: "offline",
      baseUrl: "",
      temperature: 0.2,
      maxTokens: 400,
    },
    execution: {
      dockerNetwork: "",
      remoteSyncMode: "",
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "",
      remoteWorkspaceLabel: "",
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
      sshPort: 0,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 0,
    },
  };
}

function createLinkedAccounts(
  overrides: Partial<LinkedProviderAccountsSnapshot> = {},
): LinkedProviderAccountsSnapshot {
  return {
    codex: {
      provider: "codex",
      available: false,
      reusable: false,
      detail: "codex",
    },
    claudeCode: {
      provider: "claude-code",
      available: false,
      reusable: false,
      detail: "claude",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      reusable: false,
      detail: "cloud",
    },
    ...overrides,
  };
}

describe("service settings bootstrap", () => {
  it("promotes stale Eliza Cloud models to the stable defaults", () => {
    const config = createConfig({
      elizaCloudEnabled: true,
      elizaCloudApiKey: "cloud-key",
      elizaCloudSmallModel: "xai/grok-4.1-fast-non-reasoning-beta",
      elizaCloudLargeModel: "xai/grok-4.1-fast-reasoning-beta",
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "elizacloud";
    currentSettings.model.model = "xai/grok-4.20-multi-agent-beta";
    currentSettings.model.baseUrl = "https://stale.example";
    const updates: Array<[string, unknown]> = [];

    applyServiceSettingsBootstrap(
      config,
      currentSettings as never,
      createLinkedAccounts(),
      "xai/grok-4.1-fast-non-reasoning",
      "xai/grok-4.1-fast-reasoning",
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toContainEqual([
      "model.model",
      "xai/grok-4.1-fast-reasoning",
    ]);
    expect(updates).toContainEqual(["model.baseUrl", config.elizaCloudBaseUrl]);
    expect(config.elizaCloudSmallModel).toBe("xai/grok-4.1-fast-non-reasoning");
    expect(config.elizaCloudLargeModel).toBe("xai/grok-4.1-fast-reasoning");
  });

  it("falls back from disabled Eliza Cloud to linked Codex when available", () => {
    const config = createConfig();
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "elizacloud";
    const updates: Array<[string, unknown]> = [];

    applyServiceSettingsBootstrap(
      config,
      currentSettings as never,
      createLinkedAccounts({
        codex: {
          provider: "codex",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "codex ready",
        },
      }),
      "xai/grok-4.1-fast-non-reasoning",
      "xai/grok-4.1-fast-reasoning",
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toContainEqual(["model.provider", "codex"]);
    expect(updates).toContainEqual(["model.model", "gpt-5.4"]);
    expect(updates).toContainEqual([
      "model.baseUrl",
      "https://chatgpt.com/backend-api/codex",
    ]);
  });

  it("hydrates missing execution defaults from env config", () => {
    const config = createConfig({
      remoteSyncInclude: ["src/**/*", "package.json"],
      modalEnvironment: "prod",
      mcpServerCommand: "bun run mcp",
    });
    const updates: Array<[string, unknown]> = [];

    applyServiceSettingsBootstrap(
      config,
      createCurrentSettings() as never,
      createLinkedAccounts(),
      "xai/grok-4.1-fast-non-reasoning",
      "xai/grok-4.1-fast-reasoning",
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toContainEqual(["execution.remoteSyncMode", "mirror"]);
    expect(updates).toContainEqual([
      "execution.remoteSyncInclude",
      ["src/**/*", "package.json"],
    ]);
    expect(updates).toContainEqual(["execution.modalEnvironment", "prod"]);
    expect(updates).toContainEqual(["mcp.serverCommand", "bun run mcp"]);
  });
});
