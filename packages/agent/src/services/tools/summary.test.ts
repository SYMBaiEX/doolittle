import { describe, expect, it } from "bun:test";
import type { ToolDefinition } from "@/types";
import { buildToolRegistrySummary } from "./summary";
import type { ToolRegistryDynamicState } from "./types";

describe("buildToolRegistrySummary", () => {
  it("builds transport, ownership, and ecosystem aggregates from tool and dynamic state", () => {
    const mcpTool: ToolDefinition = {
      id: "mcp.bridge",
      name: "MCP Bridge",
      category: "mcp",
      description: "MCP bridge",
      enabled: true,
      transport: "native",
    };
    const browserTool: ToolDefinition = {
      id: "browser.status",
      name: "Browser Status",
      category: "documents",
      description: "Browser",
      enabled: false,
      transport: "service",
    };
    const tools: ToolDefinition[] = [mcpTool, browserTool];
    const grouped = {
      mcp: [mcpTool],
      documents: [browserTool],
    };
    const dynamic: ToolRegistryDynamicState = {
      mcpEnabled: true,
      discoveredMcpTools: 2,
      discoveredMcpToolNames: ["sum", "echo"],
      nativePluginManagerTotal: 6,
      nativePluginManagerEnabled: 4,
      nativePluginManagerOfficial: 2,
      nativePluginManagerVendored: 2,
      nativePluginManagerCategories: 3,
      nativeLaggingLatestPackages: 1,
      agentSdkRegistryAvailable: true,
      agentSdkRegistryPlugins: 7,
      agentSdkCatalogAvailable: true,
      agentSdkCatalogSkills: 9,
      agentSdkCompatibilityFailures: 1,
      skillsHubTotal: 5,
      skillsHubGenerated: 2,
      skillsHubCatalogTotal: 3,
      skillsHubManifestCount: 4,
      skillsHubInstalledTotal: 1,
      skillsHubFamilyTotal: 2,
      ecosystemBenchmarkPacks: 1,
      ecosystemDistributionChannels: 2,
      ecosystemModelingProfiles: 3,
    };

    const summary = buildToolRegistrySummary(tools, grouped, dynamic);

    expect(summary.total).toBe(2);
    expect(summary.enabled).toBe(1);
    expect(summary.disabled).toBe(1);
    expect(
      summary.transports.some((entry) => entry.transport === "native"),
    ).toBe(true);
    expect(
      summary.categories.some((entry) => entry.category === "documents"),
    ).toBe(true);
    expect(summary.mcp.discoveredToolNames).toEqual(["sum", "echo"]);
    expect(summary.native.total).toBe(6);
    expect(summary.ownership.skillHubTotal).toBe(5);
    expect(summary.ecosystem.registryAvailable).toBe(true);
    expect(summary.ecosystem.modelingProfiles).toBe(3);
  });
});
