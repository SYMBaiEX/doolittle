import type { ToolDefinition } from "../../types/index";
import type { ToolRegistryDynamicState, ToolRegistrySummary } from "./types";

export function buildToolRegistrySummary(
  tools: ToolDefinition[],
  grouped: Record<string, ToolDefinition[]>,
  dynamic: ToolRegistryDynamicState,
): ToolRegistrySummary {
  const enabled = tools.filter((tool) => tool.enabled);
  const transportMap = tools.reduce<Map<string, ToolDefinition[]>>(
    (map, tool) => {
      const key = tool.transport ?? "service";
      map.set(key, [...(map.get(key) ?? []), tool]);
      return map;
    },
    new Map(),
  );
  const transports = Array.from(transportMap.entries()).map(
    ([transport, entries]) => ({
      transport,
      total: entries.length,
      enabled: entries.filter((tool) => tool.enabled).length,
    }),
  );
  const categories = Object.entries(grouped).map(([category, entries]) => ({
    category,
    total: entries.length,
    enabled: entries.filter((tool) => tool.enabled).length,
  }));
  const nativeOwnershipControlPlane =
    dynamic.nativeOwnershipControlPlane ?? null;
  const skillTotals = {
    skillsHubTotal: dynamic.skillsHubTotal ?? 0,
    skillsHubGenerated: dynamic.skillsHubGenerated ?? 0,
    skillsHubCatalogTotal: dynamic.skillsHubCatalogTotal ?? 0,
    skillsHubManifestCount: dynamic.skillsHubManifestCount ?? 0,
    skillsHubInstalledTotal: dynamic.skillsHubInstalledTotal ?? 0,
    skillsHubFamilyTotal: dynamic.skillsHubFamilyTotal ?? 0,
  };

  return {
    total: tools.length,
    enabled: enabled.length,
    disabled: tools.length - enabled.length,
    transports,
    categories,
    mcp: {
      enabled: dynamic.mcpEnabled,
      discoveredTools: dynamic.discoveredMcpTools,
      discoveredToolNames: dynamic.discoveredMcpToolNames ?? [],
    },
    native: {
      total:
        nativeOwnershipControlPlane?.pluginManager?.summary.total ??
        dynamic.nativePluginManagerTotal ??
        0,
      enabled:
        nativeOwnershipControlPlane?.pluginManager?.summary.enabled ??
        dynamic.nativePluginManagerEnabled ??
        0,
      official:
        nativeOwnershipControlPlane?.pluginManager?.summary.official ??
        dynamic.nativePluginManagerOfficial ??
        0,
      vendored:
        nativeOwnershipControlPlane?.pluginManager?.summary.vendored ??
        dynamic.nativePluginManagerVendored ??
        0,
      categories:
        nativeOwnershipControlPlane?.pluginManager?.summary.categories ??
        dynamic.nativePluginManagerCategories ??
        0,
    },
    ownership: {
      serviceResolution:
        nativeOwnershipControlPlane?.serviceResolution.length ?? 0,
      operationalTransports:
        nativeOwnershipControlPlane?.transportControl.totals
          .operationalTransports ?? 0,
      pluginManagerEnabled:
        nativeOwnershipControlPlane?.pluginManager?.summary.enabled ?? 0,
      pluginManagerOfficial:
        nativeOwnershipControlPlane?.pluginManager?.summary.official ?? 0,
      pluginManagerVendored:
        nativeOwnershipControlPlane?.pluginManager?.summary.vendored ?? 0,
      skillHubTotal: skillTotals.skillsHubTotal,
      skillHubGenerated: skillTotals.skillsHubGenerated,
      skillHubCatalogTotal: skillTotals.skillsHubCatalogTotal,
      skillHubManifestCount: skillTotals.skillsHubManifestCount,
      skillHubInstalledTotal: skillTotals.skillsHubInstalledTotal,
      skillHubFamilyTotal: skillTotals.skillsHubFamilyTotal,
      nativeServices:
        nativeOwnershipControlPlane?.serviceResolution.filter(
          (entry) => entry.source === "native",
        ).length ?? 0,
      unavailableServices:
        nativeOwnershipControlPlane?.serviceResolution.filter(
          (entry) => entry.source === "unavailable",
        ).length ?? 0,
    },
    ecosystem: {
      registryAvailable: dynamic.agentSdkRegistryAvailable ?? false,
      registryPlugins: dynamic.agentSdkRegistryPlugins ?? 0,
      skillCatalogAvailable: dynamic.skillsHubCatalogProjected ?? false,
      skillCatalogSkills: dynamic.skillsHubCatalogTotal ?? 0,
      compatibilityFailures: dynamic.agentSdkCompatibilityFailures ?? 0,
      ...skillTotals,
      laggingLatestPackages: dynamic.nativeLaggingLatestPackages ?? 0,
    },
  };
}
