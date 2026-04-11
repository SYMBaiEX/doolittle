import type { ToolDefinition } from "@/types";
import { TOOL_CATALOG } from "./catalog";
import { expandPluginTools, patchToolDescription } from "./descriptions";
import { buildToolRegistrySummary } from "./summary";
import type { ToolRegistryDynamicState, ToolRegistrySummary } from "./types";

export class ToolsService {
  constructor(
    private readonly getDynamicState: () => ToolRegistryDynamicState = () => ({
      mcpEnabled: false,
      discoveredMcpTools: 0,
      discoveredMcpToolNames: [],
      acpEnabled: false,
      nativePluginManagerTotal: 0,
      nativePluginManagerEnabled: 0,
      nativePluginManagerOfficial: 0,
      nativePluginManagerVendored: 0,
      nativePluginManagerCategories: 0,
      nativeCatalog: [],
      nativeRuntimeLatest: "unknown",
      nativeRuntimeAlpha: "unknown",
      nativeAlignedPackages: 0,
      nativeAlphaOnlyPackages: 0,
      nativeLaggingLatestPackages: 0,
      nativeWorkspaceOnlyPackages: 0,
      skillsHubTotal: 0,
      skillsHubGenerated: 0,
      skillsHubCatalogTotal: 0,
      skillsHubManifestCount: 0,
      skillsHubInstalledTotal: 0,
      skillsHubFamilyTotal: 0,
      ecosystemBenchmarkPacks: 0,
      ecosystemDistributionChannels: 0,
      ecosystemModelingProfiles: 0,
    }),
  ) {}

  baseDefinitions(): ToolDefinition[] {
    return TOOL_CATALOG.map((tool) => ({ ...tool }));
  }

  list(): ToolDefinition[] {
    const dynamic = this.getDynamicState();
    const baseTools = TOOL_CATALOG.map((tool) =>
      patchToolDescription({ ...tool }, dynamic),
    );
    return [...baseTools, ...expandPluginTools(dynamic)];
  }

  enabled(): ToolDefinition[] {
    return this.list().filter((tool) => tool.enabled);
  }

  search(query: string): ToolDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.list();
    }
    return this.list().filter((tool) =>
      [
        tool.id,
        tool.name,
        tool.category,
        tool.description,
        tool.transport ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }

  get(id: string): ToolDefinition | undefined {
    return this.list().find((tool) => tool.id === id);
  }

  byCategory(category: string): ToolDefinition[] {
    return this.list().filter((tool) => tool.category === category);
  }

  grouped(): Record<string, ToolDefinition[]> {
    return this.list().reduce<Record<string, ToolDefinition[]>>(
      (groups, tool) => {
        groups[tool.category] ??= [];
        groups[tool.category].push(tool);
        return groups;
      },
      {},
    );
  }

  summary(): ToolRegistrySummary {
    const tools = this.list();
    return buildToolRegistrySummary(
      tools,
      tools.reduce<Record<string, ToolDefinition[]>>((groups, tool) => {
        groups[tool.category] ??= [];
        groups[tool.category].push(tool);
        return groups;
      }, {}),
      this.getDynamicState(),
    );
  }
}
