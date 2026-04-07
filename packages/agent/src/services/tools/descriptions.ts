import type { ToolDefinition } from "@/types";
import type { ToolRegistryDynamicState } from "./types";

type DescriptionPatcher = (
  tool: ToolDefinition,
  dynamic: ToolRegistryDynamicState,
) => ToolDefinition;

const PATCHERS: Record<string, DescriptionPatcher> = {
  "mcp.bridge": (tool, dynamic) => ({
    ...tool,
    enabled: dynamic.mcpEnabled,
    description: dynamic.mcpEnabled
      ? `Structured MCP bridge enabled with ${dynamic.discoveredMcpTools} discovered tool(s)${
          dynamic.discoveredMcpToolNames?.length
            ? `: ${dynamic.discoveredMcpToolNames.slice(0, 5).join(", ")}`
            : ""
        }.`
      : "Structured MCP bridge is available but not configured.",
  }),

  "plugins.native": (tool, dynamic) => ({
    ...tool,
    description: dynamic.nativeOwnershipControlPlane?.pluginManager?.summary
      ? `Native ElizaOS stack includes ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.enabled}/${dynamic.nativeOwnershipControlPlane.pluginManager.summary.total} enabled plugin definitions across ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.categories} categories, with ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.official} official and ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.vendored} vendored packages.`
      : `Native ElizaOS stack includes ${dynamic.nativePluginManagerEnabled ?? 0}/${dynamic.nativePluginManagerTotal ?? 0} enabled plugin definitions across ${dynamic.nativePluginManagerCategories ?? 0} categories, with ${dynamic.nativePluginManagerOfficial ?? 0} official and ${dynamic.nativePluginManagerVendored ?? 0} vendored packages.`,
  }),

  "packages.native": (tool, dynamic) => ({
    ...tool,
    description: `Latest runtime=${dynamic.nativeRuntimeLatest ?? "unknown"} alpha=${dynamic.nativeRuntimeAlpha ?? "unknown"} aligned=${dynamic.nativeAlignedPackages ?? 0} alphaOnly=${dynamic.nativeAlphaOnlyPackages ?? 0} laggingLatest=${dynamic.nativeLaggingLatestPackages ?? 0} workspaceOnly=${dynamic.nativeWorkspaceOnlyPackages ?? 0}.`,
  }),

  "runtime.registry": (tool, dynamic) => ({
    ...tool,
    description: dynamic.agentSdkRegistryAvailable
      ? `ElizaOS registry snapshot available with ${dynamic.agentSdkRegistryPlugins ?? 0} plugin entries.`
      : "ElizaOS registry snapshot is unavailable in the current environment.",
  }),

  "runtime.compatibility": (tool, dynamic) => ({
    ...tool,
    description:
      (dynamic.agentSdkCompatibilityFailures ?? 0) > 0
        ? `ElizaOS compatibility reported ${dynamic.agentSdkCompatibilityFailures ?? 0} plugin/core mismatch(es).`
        : "ElizaOS compatibility checks are currently clean.",
  }),

  "runtime.ownership": (tool, dynamic) => ({
    ...tool,
    description:
      dynamic.nativeOwnershipControlPlane || dynamic.nativeOwnershipSnapshot
        ? `Shared ownership snapshot: services=${dynamic.nativeOwnershipControlPlane?.serviceResolution.length ?? 0} operational=${dynamic.nativeOwnershipControlPlane?.transportControl.totals.operationalTransports ?? 0} pluginManager=${dynamic.nativeOwnershipControlPlane?.pluginManager?.summary.enabled ?? 0} skillHub=${dynamic.nativeOwnershipSnapshot?.skillHub.workspaceTotal ?? dynamic.skillsHubTotal ?? 0}/${dynamic.nativeOwnershipSnapshot?.skillHub.installedTotal ?? dynamic.skillsHubInstalledTotal ?? 0}.`
        : "Shared native ownership snapshot is unavailable in the current environment.",
  }),

  "skills.catalog": (tool, dynamic) => ({
    ...tool,
    description: dynamic.agentSdkCatalogAvailable
      ? `ElizaOS skill catalog available with ${dynamic.agentSdkCatalogSkills ?? 0} cached skills.`
      : "ElizaOS skill catalog is unavailable in the current environment.",
  }),

  "skills.hub": (tool, dynamic) => ({
    ...tool,
    description: dynamic.nativeOwnershipSnapshot
      ? `Skills hub summary=${dynamic.nativeOwnershipSnapshot.skillHub.workspaceTotal} generated=${dynamic.nativeOwnershipSnapshot.skillHub.generatedTotal} catalog=${dynamic.nativeOwnershipSnapshot.skillHub.catalogTotal} manifests=${dynamic.nativeOwnershipSnapshot.skillHub.exportedManifests} installed=${dynamic.nativeOwnershipSnapshot.skillHub.installedTotal} families=${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}.`
      : `Skills hub summary=${dynamic.skillsHubTotal ?? 0} generated=${dynamic.skillsHubGenerated ?? 0} catalog=${dynamic.skillsHubCatalogTotal ?? 0} manifests=${dynamic.skillsHubManifestCount ?? 0} installed=${dynamic.skillsHubInstalledTotal ?? 0} families=${dynamic.skillsHubFamilyTotal ?? 0}.`,
  }),

  "skills.families": (tool, dynamic) => ({
    ...tool,
    description: dynamic.nativeOwnershipSnapshot
      ? `Curated and generated skill families available: ${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}.`
      : `Curated and generated skill families available: ${dynamic.skillsHubFamilyTotal ?? 0}.`,
  }),

  "skills.family": (tool, dynamic) => ({
    ...tool,
    description: dynamic.nativeOwnershipSnapshot
      ? `Inspect a single skill family from the ${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}-family hub.`
      : `Inspect a single skill family from the ${dynamic.skillsHubFamilyTotal ?? 0}-family hub.`,
  }),

  "skills.installed": (tool, dynamic) => ({
    ...tool,
    description: dynamic.nativeOwnershipSnapshot
      ? `Installed skill manifests available: ${dynamic.nativeOwnershipSnapshot.skillHub.installedTotal}.`
      : `Installed skill manifests available: ${dynamic.skillsHubInstalledTotal ?? 0}.`,
  }),
};

/**
 * Apply dynamic-state description patches to a static catalog tool.
 * Returns the tool unchanged if no patcher is registered for its id.
 */
export function patchToolDescription(
  tool: ToolDefinition,
  dynamic: ToolRegistryDynamicState,
): ToolDefinition {
  const patcher = PATCHERS[tool.id];
  return patcher ? patcher(tool, dynamic) : tool;
}

/**
 * Expand native catalog plugins from dynamic state into ToolDefinition entries.
 */
export function expandPluginTools(
  dynamic: ToolRegistryDynamicState,
): ToolDefinition[] {
  return (
    dynamic.nativeCatalog?.map<ToolDefinition>((plugin) => ({
      id: `plugins.native.${plugin.id}`,
      name: `Native Plugin ${plugin.id}`,
      category: "runtime",
      description: `${plugin.source} ${plugin.category} plugin: ${plugin.notes}`,
      enabled: plugin.enabled,
      transport: "native",
    })) ?? []
  );
}
