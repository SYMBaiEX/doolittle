import { describe, expect, test } from "bun:test";
import { AgentSdkService } from "./agent-sdk-service";

describe("AgentSdkService", () => {
  test("builds a combined ecosystem overview from cached sources", async () => {
    const service = new AgentSdkService();
    const sdk = service as unknown as {
      audit: () => Promise<{
        foundationPackages: string[];
        installed: Record<string, string | undefined>;
        ecosystemPackages?: string[];
        ecosystemInstalled?: Record<string, string | undefined>;
        legacyPackages?: string[];
        legacyInstalled?: Record<string, string | undefined>;
        compatibility: unknown[];
        skillCatalog: { cachedSkills: number };
      }>;
      registry: () => Promise<{
        endpoints: string[];
        total: number;
        nonAppPlugins: number;
      }>;
      skillCatalog: () => Promise<{
        total: number;
        trending: Array<{ slug: string }>;
      }>;
    };

    sdk.audit = async () => ({
      foundationPackages: ["@elizaos/agent", "@elizaos/autonomous"],
      installed: {
        "@elizaos/agent": "2.0.0-alpha.85",
        "@elizaos/autonomous": "2.0.0-alpha.85",
      },
      ecosystemPackages: [],
      ecosystemInstalled: {},
      compatibility: [
        { plugin: "@elizaos/plugin-openai", compatible: true },
        { plugin: "@elizaos/plugin-browser", compatible: true },
      ],
      skillCatalog: {
        cachedSkills: 8,
      },
    });

    sdk.registry = async () => ({
      endpoints: ["npm", "github"],
      total: 14,
      nonAppPlugins: 11,
    });

    sdk.skillCatalog = async () => ({
      total: 27,
      trending: [{ slug: "operator" }, { slug: "browser" }],
    });

    const overview = await service.overview();

    expect(overview.summary).toEqual({
      foundationPackages: 2,
      installedFoundationPackages: 2,
      ecosystemPackages: 0,
      installedEcosystemPackages: 0,
      compatibilityChecks: 2,
      compatibilityFailures: 0,
      registryEndpoints: 2,
      registryPlugins: 14,
      nonAppPlugins: 11,
      skillCatalogSkills: 27,
      trendingSkills: 2,
    });
  });
});
