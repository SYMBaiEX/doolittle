import { describe, expect, test } from "vitest";
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
        compatibility: unknown[];
      }>;
      registry: () => Promise<{
        endpoints: string[];
        total: number;
        nonAppPlugins: number;
      }>;
    };

    sdk.audit = async () => ({
      foundationPackages: ["@elizaos/agent", "elizaos"],
      installed: {
        "@elizaos/agent": "2.0.3-beta.7",
        elizaos: "2.0.3-beta.7",
      },
      ecosystemPackages: [],
      ecosystemInstalled: {},
      compatibility: [{ plugin: "@elizaos/plugin-openai", compatible: true }],
    });

    sdk.registry = async () => ({
      endpoints: ["npm", "github"],
      total: 14,
      nonAppPlugins: 11,
    });

    const overview = await service.overview();

    expect(overview.summary).toEqual({
      foundationPackages: 2,
      installedFoundationPackages: 2,
      ecosystemPackages: 0,
      installedEcosystemPackages: 0,
      compatibilityChecks: 1,
      compatibilityFailures: 0,
      registryEndpoints: 2,
      registryPlugins: 14,
      nonAppPlugins: 11,
    });
  });
});
