import { describe, expect, it } from "vitest";
import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { EnvConfig } from "@/types";
import {
  applyProviderBootstrapFallbacks,
  cloudModelLooksStale,
  cloudSmallModelLooksStale,
  reconcileElizaCloudBootstrap,
  resolvePersistedProviderAvailability,
} from "./cloud-bootstrap";
import type { RuntimeSettingsSnapshot } from "./types";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    gatewayDataDir: "/tmp/doolittle-gateway",
    workspaceDir: "/tmp/workspace",
    skillsDir: "/tmp/skills",
    hooksDir: "/tmp/hooks",
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
    dockerImage: "ghcr.io/nubjs/nub:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: ["PATH"],
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
      dockerImage: "ghcr.io/nubjs/nub:latest",
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
      servers: {},
      maxRetries: 2,
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
    devin: {
      provider: "devin",
      available: false,
      reusable: false,
      detail: "devin",
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
describe("cloud bootstrap helpers", () => {
  it("recognizes stale cloud model aliases", () => {
    expect(cloudModelLooksStale("xai/grok-4.20-multi-agent-beta")).toBe(true);
    expect(cloudModelLooksStale("xai/grok-4.1-fast-reasoning")).toBe(false);
    expect(
      cloudSmallModelLooksStale("xai/grok-4.1-fast-non-reasoning-beta"),
    ).toBe(true);
  });

  it("reconciles stale Eliza Cloud models to the stable defaults", () => {
    const config = createConfig({
      elizaCloudEnabled: true,
      elizaCloudApiKey: "cloud-key",
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "elizacloud";
    currentSettings.model.model = "xai/grok-4.20-multi-agent-beta";
    currentSettings.model.baseUrl = "https://stale.example";
    const updates: Array<[string, unknown]> = [];

    reconcileElizaCloudBootstrap(
      config,
      currentSettings,
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
    const linkedAccounts = createLinkedAccounts({
      codex: {
        provider: "codex",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "codex ready",
      },
    });
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      linkedAccounts,
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        linkedAccounts,
      ),
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

  it("moves stale linked-provider settings to local Ollama when linked auth is not selected", () => {
    const config = createConfig({
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaLargeModel: "granite4.1:3b",
      useLinkedCodexAuth: false,
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "codex";
    currentSettings.model.model = "gpt-5.4";
    currentSettings.model.baseUrl = "https://chatgpt.com/backend-api/codex";
    const linkedAccounts = createLinkedAccounts({
      codex: {
        provider: "codex",
        available: false,
        reusable: false,
        detail: "codex is not bound",
      },
    });
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      linkedAccounts,
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        linkedAccounts,
      ),
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toContainEqual(["model.provider", "ollama"]);
    expect(updates).toContainEqual(["model.model", "granite4.1:3b"]);
    expect(updates).toContainEqual([
      "model.baseUrl",
      "http://localhost:11434/api",
    ]);
  });

  it("keeps an explicitly selected Codex route when its linked account is ready", () => {
    const config = createConfig({
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaLargeModel: "granite4.1:3b",
      useLinkedCodexAuth: false,
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "codex";
    currentSettings.model.model = "gpt-5.4";
    currentSettings.model.baseUrl = "https://chatgpt.com/backend-api/codex";
    const linkedAccounts = createLinkedAccounts({
      codex: {
        provider: "codex",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "codex ready",
      },
    });
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      linkedAccounts,
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        linkedAccounts,
      ),
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toEqual([]);
  });

  it("keeps a saved Ollama model selected when its endpoint is unavailable", () => {
    const config = createConfig({
      ollamaApiEndpoint: "",
      ollamaLargeModel: "granite4.1:3b",
      ollamaSmallModel: "granite4.1:3b",
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "ollama";
    currentSettings.model.model = "qwen3:8b";
    currentSettings.model.baseUrl = "";
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      createLinkedAccounts(),
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        createLinkedAccounts(),
      ),
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toEqual([]);
  });

  it("keeps an explicitly selected Devin route when its linked account is ready", () => {
    const config = createConfig({
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaLargeModel: "granite4.1:3b",
      useLinkedDevinAuth: false,
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "devin";
    currentSettings.model.model = "swe-1-6-fast";
    const linkedAccounts = createLinkedAccounts({
      devin: {
        provider: "devin",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "devin ready",
      },
    });
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      linkedAccounts,
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        linkedAccounts,
      ),
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toEqual([]);
  });

  it("keeps Eliza Cloud selected when its linked account is ready", () => {
    const config = createConfig({
      elizaCloudEnabled: false,
      elizaCloudApiKey: "",
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaLargeModel: "granite4.1:3b",
    });
    const currentSettings = createCurrentSettings();
    currentSettings.model.provider = "elizacloud";
    currentSettings.model.model = "xai/grok-4.1-fast-reasoning";
    currentSettings.model.baseUrl = "https://api.eliza.cloud";
    const linkedAccounts = createLinkedAccounts({
      elizaCloud: {
        provider: "elizacloud",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "cloud ready",
      },
    });
    const updates: Array<[string, unknown]> = [];

    applyProviderBootstrapFallbacks(
      config,
      currentSettings,
      linkedAccounts,
      resolvePersistedProviderAvailability(
        config,
        currentSettings,
        linkedAccounts,
      ),
      ((path: string, value: unknown) => {
        updates.push([path, value]);
      }) as never,
    );

    expect(updates).toEqual([]);
  });
});
