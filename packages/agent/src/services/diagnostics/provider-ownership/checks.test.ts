import { describe, expect, it } from "bun:test";
import { buildProviderOwnershipChecks } from "./checks";
import type { ProviderOwnershipContext } from "./types";

const baseContext = {
  config: {
    openAiApiKey: undefined,
    anthropicApiKey: undefined,
    openAiTemperature: 0.5,
    openAiMaxTokens: 1200,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-4.1-mini",
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-haiku-4-5-20251001",
    anthropicLargeModel: "claude-sonnet-4.6",
    useLinkedCodexAuth: false,
    useLinkedClaudeCodeAuth: false,
    offlineBootstrapMode: false,
    elizaCloudEnabled: false,
    elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
    elizaCloudEmbeddingUrl: undefined,
    elizaCloudEmbeddingApiKey: undefined,
    elizaCloudEmbeddingDimensions: undefined,
    browserProvider: "lightpanda",
    browserCommand: "lightpanda",
    mcpServerCommand: "mcp-server",
    mcpTimeoutMs: 10000,
    elizaCloudApiKey: undefined,
    elizaCloudBaseUrl: "https://api.elizacloud.ai/api/v1",
    codexNativeReady: undefined,
  } as const,
  nativeWorkspacePath: "/tmp/workspace/packages/plugins",
  nativeAudit: {
    runtime: {
      alpha: "2.0.0-alpha.88",
      latest: "2.0.0-alpha.88",
      date: "2026-04-01",
    },
    packages: [],
    summary: {
      aligned: 4,
      vendored: 0,
      alphaOnly: 0,
      laggingLatest: 0,
      workspaceOnly: 0,
    },
    activeCatalog: [],
  } as const,
  nativePlugins: [
    {
      id: "messaging.telegram",
      category: "messaging",
      enabled: true,
      source: "official",
    },
  ],
  linkedAccounts: {
    codex: {
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      detail: "codex is ready",
    },
    claudeCode: {
      provider: "claude-code",
      available: false,
      reusable: false,
      nativeReady: false,
      fallbackReady: false,
      detail: "claude code is not linked",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      reusable: false,
      nativeReady: false,
      detail: "elizacloud not linked",
    },
  },
  normalizedCloudBaseUrl: "https://api.elizacloud.ai/api/v1",
  cloudBaseUrlValidation: undefined,
  ecosystem: {
    registry: {
      available: true,
      total: 12,
      nonAppPlugins: 4,
      error: undefined,
    },
    skillCatalog: {
      available: false,
      total: 0,
      error: "missing",
    },
  },
  compatibility: {
    compatible: true,
    checked: 2,
    coreVersion: "2.0.0",
    failures: 0,
    failing: [],
  },
  workspaceEcosystem: {
    benchmarkPacks: 2,
    distributionChannels: 1,
    modelingProfiles: 1,
  },
  ownership: {
    transportControl: {
      messagingBridge: [
        {
          platform: "telegram",
          serviceAvailable: true,
          live: true,
          pluginId: "messaging.telegram",
          pluginEnabled: true,
        },
      ],
      transportInventory: [
        {
          platform: "telegram",
          operational: true,
          reason: "active",
          detail: "ok",
          source: "official",
          configEnabled: true,
          gatewayEnabled: true,
        },
      ],
      totals: {
        configured: 1,
        gatewayEnabled: 1,
        enabledPlugins: 1,
        availableServices: 1,
        liveServices: 1,
        operationalTransports: 1,
        officialPlugins: 1,
        vendoredPlugins: 0,
        customTransports: 0,
        productTransports: 0,
      },
    },
    serviceResolution: [{ plugin: "messaging.telegram" }],
    pluginManager: {
      summary: {
        total: 1,
        enabled: 1,
        official: 1,
        vendored: 0,
        categories: 1,
      },
    },
  },
  formsControl: undefined,
  runtimeExecutionControl: undefined,
  integrationControl: undefined,
  browserServices: {
    web: {
      status: async () => ({}),
    },
    mcp: {
      status: () => ({ enabled: true }),
      getCachedTools: () => [],
    },
  },
} as unknown as ProviderOwnershipContext;

describe("buildProviderOwnershipChecks", () => {
  it("marks gateway transport overview as warn when mismatches exist", () => {
    const checks = buildProviderOwnershipChecks(baseContext, {
      mismatchCount: 1,
      operationalCount: 3,
      details: [
        {
          platform: "telegram",
          mismatchFlags: ["status-mismatch"],
        },
      ],
    });
    const overview = checks.find(
      (check) => check.id === "gateway.transport.overview",
    );
    expect(overview).toEqual({
      id: "gateway.transport.overview",
      status: "warn",
      summary: "Gateway transport overview",
      detail: "operational=3 mismatches=1; telegram:status-mismatch",
    });
  });

  it("keeps gateway transport overview pass when no mismatches exist", () => {
    const checks = buildProviderOwnershipChecks(baseContext, {
      mismatchCount: 0,
      operationalCount: 3,
      details: [
        {
          platform: "telegram",
          mismatchFlags: [],
        },
      ],
    });
    const overview = checks.find(
      (check) => check.id === "gateway.transport.overview",
    );
    expect(overview).toBeDefined();
    expect(overview?.status).toBe("pass");
  });

  it("builds transport checks even when runtimeExecutionControl is missing", () => {
    const checks = buildProviderOwnershipChecks(baseContext);
    const ids = new Set(checks.map((check) => check.id));
    expect(ids.has("native.workspace")).toBe(true);
    expect(ids.has("ecosystem.compatibility")).toBe(true);
    expect(ids.has("native.messaging.control-plane")).toBe(true);
    expect(ids.has("gateway.transport.overview")).toBe(false);
  });

  it("adds forms and execution ownership checks when runtime control is available", () => {
    const checks = buildProviderOwnershipChecks({
      ...baseContext,
      formsControl: {
        available: true,
        templates: 4,
        forms: {
          total: 8,
          active: 2,
        },
        persistenceAvailable: true,
      },
      runtimeExecutionControl: {
        e2b: {
          available: true,
          sandboxes: 2,
          supportsExecution: true,
          sandboxRoot: "/tmp/e2b",
        },
        codeGeneration: {
          available: true,
          ready: false,
          methods: ["plan"],
        },
        github: {
          available: true,
        },
        secretsManager: {
          available: false,
        },
      },
    } as ProviderOwnershipContext);

    expect(checks.find((check) => check.id === "native.forms")?.status).toBe(
      "pass",
    );
    expect(
      checks.find((check) => check.id === "native.execution.e2b")?.status,
    ).toBe("pass");
    expect(
      checks.find((check) => check.id === "native.execution.codegen")?.status,
    ).toBe("warn");
  });
});
