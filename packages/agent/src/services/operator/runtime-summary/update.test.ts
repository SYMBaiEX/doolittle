import { describe, expect, it } from "bun:test";
import { buildOperatorUpdatePreview } from "./update";

function createVersionSummary() {
  return {
    name: "doolittle",
    version: "0.1.0",
    bun: "1.3.12",
    dependencies: {},
    nativePlugins: {
      total: 0,
      enabled: 0,
      official: 0,
      vendored: 0,
    },
    nativePackages: {
      runtimeLatest: "2.0.0",
      runtimeAlpha: "2.0.0-alpha.85",
      aligned: 0,
      vendored: 0,
      alphaOnly: 0,
      workspaceOnly: 0,
    },
  };
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  return {
    config: {} as never,
    diagnostics: {
      currentGatewayConfig() {
        return {} as never;
      },
      setupChecklist: async () => [],
    },
    repository: {
      isRepository: () => true,
      status: async () => "clean",
      recentCommits: async () => "abc123\nfed456",
    },
    version: createVersionSummary,
    nativeOwnership: {
      controlPlane() {
        return {
          serviceResolution: ["browser", "gateway"],
          pluginManager: {
            summary: {
              total: 3,
              enabled: 2,
              official: 1,
              vendored: 1,
              categories: 2,
            },
          },
          identity: {
            personality: { total: 1 },
            rolodex: { totalProfiles: 2 },
            experience: { sessions: { totalSessions: 4 } },
          },
          transportControl: {
            totals: {
              configured: 2,
              enabledPlugins: 2,
              gatewayEnabled: 1,
              availableServices: 1,
              liveServices: 1,
              officialPlugins: 1,
              vendoredPlugins: 0,
              operationalTransports: 1,
              customTransports: 0,
              productTransports: 0,
            },
            transportInventory: [
              {
                platform: "discord",
                source: "official",
                configEnabled: true,
                gatewayEnabled: true,
                operational: true,
                reason: "live",
                detail: "Discord is live.",
              },
            ],
          },
        } as never;
      },
    },
    agentSdk: {
      overview: async () =>
        ({
          audit: {
            coreVersion: "2.0.0-alpha.85",
            foundationPackages: [],
            installed: {},
            ecosystemPackages: [],
            ecosystemInstalled: {},
            compatibility: [],
            skillCatalog: { cachedSkills: 22 },
          },
          registry: { available: true, total: 7 },
          skillCatalog: { available: true, total: 22 },
          summary: {
            foundationPackages: 0,
            installedFoundationPackages: 0,
            ecosystemPackages: 0,
            installedEcosystemPackages: 0,
            compatibilityChecks: 0,
            compatibilityFailures: 0,
            registryEndpoints: 0,
            registryPlugins: 7,
            nonAppPlugins: 0,
            skillCatalogSkills: 22,
            trendingSkills: 0,
          },
        }) as never,
    },
    ecosystemService: {
      summary: () =>
        ({
          benchmarkPacks: 2,
          distributionChannels: 1,
          modelingProfiles: 3,
          optionalSkillPacks: 4,
        }) as never,
    },
    autocoderPipeline: {
      summary: () => ({
        total: 2,
        workflows: 1,
        latest: undefined,
        latestWorkflow: undefined,
        counts: { plan: 2 },
        failed: 0,
        failedWorkflows: 0,
        running: 0,
        runningWorkflows: 0,
      }),
    },
    ...overrides,
  };
}

describe("buildOperatorUpdatePreview", () => {
  it("builds a ready update preview with repository and runtime detail", async () => {
    const preview = await buildOperatorUpdatePreview(createDependencies());

    expect(preview.readiness.level).toBe("ready");
    expect(preview.repositoryAvailable).toBe(true);
    expect(preview.repositoryStatus).toBe("clean");
    expect(preview.recentCommits).toContain("abc123");
    expect(preview.transportControl).toEqual({
      configured: 2,
      enabledPlugins: 2,
      gatewayEnabled: 1,
      availableServices: 1,
      liveServices: 1,
      officialPlugins: 1,
      vendoredPlugins: 0,
      operationalTransports: 1,
      customTransports: 0,
      productTransports: 0,
    });
    expect(preview.transportInventory).toHaveLength(1);
    expect(preview.pluginManager).toEqual({
      available: true,
      total: 3,
      enabled: 2,
      official: 1,
      vendored: 1,
      categories: 2,
    });
    expect(preview.recommendedSteps).toEqual([
      "Review git status before updating runtime dependencies.",
      "Run bun install after dependency changes.",
      "Re-run bun run typecheck, bun test, and bun run build after updating.",
    ]);
  });

  it("degrades gracefully when the workspace is not a git repository", async () => {
    const preview = await buildOperatorUpdatePreview(
      createDependencies({
        repository: {
          isRepository: () => false,
          status: async () => "clean",
          recentCommits: async () => "",
        },
      }),
    );

    expect(preview.readiness.level).toBe("needs-attention");
    expect(preview.repositoryAvailable).toBe(false);
    expect(preview.repositoryStatus).toBe(
      "(workspace is not inside a git repository)",
    );
    expect(preview.recentCommits).toBe("(no git history available)");
    expect(preview.recommendedSteps).toEqual([
      "Initialize a git repository if you want update previews tied to commit history.",
      "Keep bun install, bun run typecheck, bun test, and bun run build as the standard update validation flow.",
    ]);
  });
});
