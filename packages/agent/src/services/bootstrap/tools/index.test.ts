import { describe, expect, it } from "bun:test";
import { createToolsDynamicStateResolver } from "./index";

describe("createToolsDynamicStateResolver", () => {
  it("builds one dynamic snapshot from each dependency read", () => {
    const calls = {
      mcpStatus: 0,
      mcpTools: 0,
      acpStatus: 0,
      nativePluginCatalog: 0,
      nativePackageAudit: 0,
      agentSdkSnapshot: 0,
      skillsHubSummary: 0,
      ecosystemSummary: 0,
      nativeOwnershipControlPlane: 0,
      nativeOwnershipSnapshot: 0,
    };

    const resolver = createToolsDynamicStateResolver({
      mcp: {
        status: () => {
          calls.mcpStatus += 1;
          return { enabled: true };
        },
        getCachedTools: () => {
          calls.mcpTools += 1;
          return [
            { name: "sum", description: "Add values." },
            { name: "echo", description: "Repeat input." },
          ];
        },
      } as never,
      acp: {
        status: () => {
          calls.acpStatus += 1;
          return { enabled: true };
        },
      } as never,
      agentSdk: {
        snapshot: () => {
          calls.agentSdkSnapshot += 1;
          return {
            registry: { available: true, total: 4 },
            skillCatalog: { available: true, total: 9 },
            audit: {
              compatibility: [{ compatible: true }, { compatible: false }],
            },
          };
        },
      } as never,
      skillsHub: {
        summary: () => {
          calls.skillsHubSummary += 1;
          return {
            workspaceTotal: 12,
            generatedTotal: 5,
            catalogTotal: 7,
            exportedManifests: 3,
            installedTotal: 8,
            familyTotal: 2,
          };
        },
      } as never,
      ecosystem: {
        summary: () => {
          calls.ecosystemSummary += 1;
          return {
            benchmarkPacks: 6,
            distributionChannels: 4,
            modelingProfiles: 3,
          };
        },
      } as never,
      nativeOwnership: {
        controlPlane: () => {
          calls.nativeOwnershipControlPlane += 1;
          return {
            serviceResolution: [{ source: "native" }],
            transportControl: {
              totals: {
                configured: 1,
                enabledPlugins: 1,
                gatewayEnabled: 1,
                availableServices: 1,
                liveServices: 1,
                officialPlugins: 1,
                vendoredPlugins: 1,
                operationalTransports: 1,
                customTransports: 0,
                productTransports: 0,
              },
            },
            pluginManager: {
              summary: {
                total: 2,
                enabled: 2,
                official: 1,
                vendored: 1,
                categories: 2,
              },
            },
          };
        },
        snapshotSync: () => {
          calls.nativeOwnershipSnapshot += 1;
          return {
            skillHub: {
              workspaceTotal: 12,
              generatedTotal: 5,
              catalogTotal: 7,
              installedTotal: 8,
              installable: 0,
              exportedManifests: 3,
              familyTotal: 2,
              curatedFamilyTotal: 1,
              generatedFamilyTotal: 1,
              manifestsDir: "/tmp/manifests",
              summary: "ok",
              distribution: {
                sources: [],
                categories: [],
                roots: [],
                tags: [],
              },
              families: [],
              recentWorkspace: [],
              recentCatalog: [],
              recentInstalled: [],
            },
          };
        },
      } as never,
      nativePluginCatalog: () => {
        calls.nativePluginCatalog += 1;
        return [
          {
            id: "messaging.telegram",
            category: "messaging",
            source: "official",
            enabled: true,
            notes: "Official Telegram transport plugin.",
          },
          {
            id: "tools.browser",
            category: "documents",
            source: "vendored",
            enabled: false,
            notes: "Vendored browser helper.",
          },
        ];
      },
      nativePackageAudit: () => {
        calls.nativePackageAudit += 1;
        return {
          runtime: {
            latest: "1.2.3",
            alpha: "1.3.0-alpha.1",
          },
          summary: {
            aligned: 9,
            alphaOnly: 1,
            laggingLatest: 2,
            workspaceOnly: 3,
          },
        };
      },
    });

    const state = resolver();

    expect(state.discoveredMcpToolNames).toEqual(["sum", "echo"]);
    expect(state.nativePluginManagerTotal).toBe(2);
    expect(state.nativePluginManagerEnabled).toBe(1);
    expect(state.nativePluginManagerOfficial).toBe(1);
    expect(state.nativePluginManagerVendored).toBe(1);
    expect(state.nativePluginManagerCategories).toBe(2);
    expect(state.agentSdkRegistryPlugins).toBe(4);
    expect(state.agentSdkCatalogSkills).toBe(9);
    expect(state.agentSdkCompatibilityFailures).toBe(1);
    expect(state.skillsHubInstalledTotal).toBe(8);
    expect(state.ecosystemBenchmarkPacks).toBe(6);
    expect(state.nativeRuntimeLatest).toBe("1.2.3");
    expect(state.nativeLaggingLatestPackages).toBe(2);

    expect(calls).toEqual({
      mcpStatus: 1,
      mcpTools: 1,
      acpStatus: 1,
      nativePluginCatalog: 1,
      nativePackageAudit: 1,
      agentSdkSnapshot: 1,
      skillsHubSummary: 1,
      ecosystemSummary: 1,
      nativeOwnershipControlPlane: 1,
      nativeOwnershipSnapshot: 1,
    });
  });
});
