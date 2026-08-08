import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { getNativePackageAudit } from "@/runtime/native/package-audit";
import type { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig, GatewayConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { EcosystemService } from "../../ecosystem-service";
import type { SkillsHubService } from "../../skills-hub/service";
import { collectProviderOwnershipContext } from "./context";
import type { ProviderOwnershipNativeOwnershipControl } from "./types";

function buildConfig() {
  return {
    workspaceDir: "/tmp/doolittle-workspace",
    elizaCloudBaseUrl: "https://api.elizacloud.ai/api/v1",
    browserProvider: "lightpanda",
    browserCommand: "lightpanda",
    mcpServerCommand: undefined,
    mcpTimeoutMs: 10000,
    openAiApiKey: undefined,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-4.1-mini",
    openAiTemperature: 0.2,
    openAiMaxTokens: 1200,
    anthropicApiKey: undefined,
    useLinkedCodexAuth: false,
    useLinkedClaudeCodeAuth: false,
    offlineBootstrapMode: false,
    elizaCloudEnabled: false,
    elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
    ollamaApiEndpoint: "http://localhost:11434/api",
    ollamaSmallModel: "granite4.1:3b",
    ollamaLargeModel: "granite4.1:3b",
    ollamaEmbeddingModel: "nomic-embed-text:latest",
    elizaCloudEmbeddingApiKey: undefined,
    elizaCloudEmbeddingUrl: undefined,
    elizaCloudEmbeddingDimensions: 1536,
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-haiku-4-5-20251001",
    anthropicLargeModel: "claude-sonnet-4.6",
  } as EnvConfig;
}

const linkedAccounts = getLinkedProviderAccountsSnapshot(
  join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "fake-home"),
);

const nativeAudit = {
  runtime: {
    beta: "2.0.3-beta.7",
    latest: "1.7.2",
    date: "2026-04-01",
  },
  packages: [],
  summary: {
    aligned: 4,
    vendored: 0,
    betaOnly: 0,
    laggingLatest: 0,
    workspaceOnly: 0,
  },
  activeCatalog: [],
} as unknown as ReturnType<typeof getNativePackageAudit>;

const nativePluginCatalog = [
  {
    id: "messaging.telegram",
    packageName: "@elizaos/plugin-telegram",
    kind: "messaging",
    source: "official",
    persistence: "none",
    version: "1.0.0",
    enabled: true,
    role: "messaging",
    notes: "",
    category: "messaging",
    maturity: "production",
    isFallback: false,
    reason: "",
    enablement: "always",
  },
] as unknown as ReturnType<typeof getNativePluginCatalog>;

describe("collectProviderOwnershipContext", () => {
  it("builds a stable context with injected dependencies", async () => {
    const config = buildConfig();
    const gatewayConfig = { platforms: {} } as unknown as GatewayConfig;

    const context = await collectProviderOwnershipContext({
      config,
      gatewayConfig,
      dependencies: {
        getNativePackageAudit: () => nativeAudit,
        getNativePluginCatalog: () => nativePluginCatalog,
        getRuntimeProviderAccountsSnapshot: () => linkedAccounts,
        resolveCloudApiBaseUrl: (value?: string) => `resolved:${value}`,
        validateCloudBaseUrl: async () => null,
      },
    });

    expect(context.nativeWorkspacePath).toBe(
      join(config.workspaceDir, "packages", "plugins"),
    );
    expect(context.nativeAudit).toBe(nativeAudit);
    expect(context.nativePlugins).toBe(nativePluginCatalog);
    expect(context.linkedAccounts).toBe(linkedAccounts);
    expect(context.normalizedCloudBaseUrl).toBe(
      `resolved:${config.elizaCloudBaseUrl}`,
    );
    expect(context.cloudBaseUrlValidation).toBeUndefined();
  });

  it("prefers injected nativeOwnership control plane over runtime ownership", async () => {
    const config = buildConfig();
    const gatewayConfig = { platforms: {} } as unknown as GatewayConfig;
    const controlPlane = {
      transportControl: {
        messagingBridge: [],
        transportInventory: [],
        totals: {
          configured: 0,
          gatewayEnabled: 0,
          enabledPlugins: 0,
          availableServices: 0,
          liveServices: 0,
          operationalTransports: 0,
          officialPlugins: 0,
          vendoredPlugins: 0,
          customTransports: 0,
          productTransports: 0,
        },
      },
      pluginManager: {
        summary: {
          total: 0,
          enabled: 0,
          official: 0,
          vendored: 0,
          categories: 0,
        },
      },
      serviceResolution: [],
    } as unknown as ProviderOwnershipNativeOwnershipControl;
    const nativeOwnership = {
      controlPlane: () => controlPlane,
    } as unknown as NativeOwnershipCache;

    const context = await collectProviderOwnershipContext({
      config,
      gatewayConfig,
      nativeOwnership,
      dependencies: {
        getNativeOwnershipControlPlane: () => {
          throw new Error("should not be called");
        },
      },
    });

    expect(context.ownership).toBe(controlPlane);
  });

  it("maps ecosystem snapshots from agent and ecosystem services", async () => {
    const config = buildConfig();
    const gatewayConfig = { platforms: {} } as unknown as GatewayConfig;
    const agentSdk = {
      overview: async () =>
        ({
          registry: {
            available: true,
            total: 12,
            nonAppPlugins: 3,
            error: undefined,
          },
        }) as const,
      compatibility: async () =>
        ({
          compatible: false,
          checked: 4,
          coreVersion: "2.0.0",
          failures: 1,
          failing: [{ plugin: "@elizaos/plugin-failing" }],
        }) as const,
    } as unknown as AgentSdkService;
    const ecosystemService = {
      summary: () =>
        ({
          optionalSkillPacks: 3,
        }) as const,
    } as unknown as EcosystemService;
    const skillsHubService = {
      summary: () =>
        ({
          catalogProjected: true,
          catalogTotal: 14,
        }) as const,
    } as unknown as SkillsHubService;
    const context = await collectProviderOwnershipContext({
      config,
      gatewayConfig,
      agentSdk,
      ecosystemService,
      skillsHubService,
      dependencies: {
        getNativePackageAudit: () => nativeAudit,
        getNativePluginCatalog: () => nativePluginCatalog,
        getRuntimeProviderAccountsSnapshot: () => linkedAccounts,
        resolveCloudApiBaseUrl: (value?: string) => `resolved:${value}`,
        validateCloudBaseUrl: async () => null,
      },
    });

    expect(context.ecosystem?.registry).toEqual({
      available: true,
      total: 12,
      nonAppPlugins: 3,
      error: undefined,
    });
    expect(context.ecosystem?.skillCatalog).toEqual({
      available: true,
      total: 14,
      error: undefined,
    });
    expect(context.compatibility).toEqual({
      compatible: false,
      checked: 4,
      coreVersion: "2.0.0",
      failures: 1,
      failing: [{ plugin: "@elizaos/plugin-failing" }],
    });
    expect(context.workspaceEcosystem).toEqual({
      optionalSkillPacks: 3,
    });
  });
});
