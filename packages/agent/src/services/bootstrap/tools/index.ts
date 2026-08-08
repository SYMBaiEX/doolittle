import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { AcpService } from "../../acp";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { McpService } from "../../mcp";
import type { SkillsHubService } from "../../skills-hub/service";
import type { ToolRegistryDynamicState } from "../../tools/types";

type NativeCatalogSnapshot = NonNullable<
  ToolRegistryDynamicState["nativeCatalog"]
>;

interface NativePackageAuditSnapshot {
  runtime: {
    latest: string;
    beta: string;
  };
  summary: {
    aligned: number;
    betaOnly: number;
    laggingLatest: number;
    workspaceOnly: number;
  };
}

export interface ToolsDynamicStateDependencies {
  mcp: Pick<McpService, "status" | "getCachedTools">;
  acp: Pick<AcpService, "status">;
  agentSdk: Pick<AgentSdkService, "snapshot">;
  skillsHub: Pick<SkillsHubService, "summary">;
  nativeOwnership: Pick<NativeOwnershipCache, "controlPlane" | "snapshotSync">;
  nativePluginCatalog(): NativeCatalogSnapshot;
  nativePackageAudit(): NativePackageAuditSnapshot;
}

export function createToolsDynamicStateResolver(
  dependencies: ToolsDynamicStateDependencies,
): () => ToolRegistryDynamicState {
  return () => {
    const cachedMcpTools = dependencies.mcp.getCachedTools();
    const nativeCatalog = dependencies.nativePluginCatalog();
    const nativePackageAudit = dependencies.nativePackageAudit();
    const agentSdkSnapshot = dependencies.agentSdk.snapshot();
    const skillsHubSummary = dependencies.skillsHub.summary();
    return {
      mcpEnabled: dependencies.mcp.status().enabled,
      discoveredMcpTools: cachedMcpTools.length,
      discoveredMcpToolNames: cachedMcpTools.map((tool) => tool.name),
      acpEnabled: dependencies.acp.status().enabled,
      nativePluginManagerTotal: nativeCatalog.length,
      nativePluginManagerEnabled: nativeCatalog.filter((entry) => entry.enabled)
        .length,
      nativePluginManagerOfficial: nativeCatalog.filter(
        (entry) => entry.source === "official",
      ).length,
      nativePluginManagerVendored: nativeCatalog.filter(
        (entry) => entry.source === "vendored",
      ).length,
      nativePluginManagerCategories: new Set(
        nativeCatalog.map((entry) => entry.category),
      ).size,
      nativeCatalog,
      nativeRuntimeLatest: nativePackageAudit.runtime.latest,
      nativeRuntimeBeta: nativePackageAudit.runtime.beta,
      nativeAlignedPackages: nativePackageAudit.summary.aligned,
      nativeBetaOnlyPackages: nativePackageAudit.summary.betaOnly,
      nativeLaggingLatestPackages: nativePackageAudit.summary.laggingLatest,
      nativeWorkspaceOnlyPackages: nativePackageAudit.summary.workspaceOnly,
      agentSdkRegistryAvailable: agentSdkSnapshot.registry?.available ?? false,
      agentSdkRegistryPlugins: agentSdkSnapshot.registry?.total ?? 0,
      agentSdkCompatibilityFailures:
        agentSdkSnapshot.audit?.compatibility.filter(
          (entry) => !entry.compatible,
        ).length ?? 0,
      skillsHubTotal: skillsHubSummary.workspaceTotal,
      skillsHubGenerated: skillsHubSummary.generatedTotal,
      skillsHubCatalogProjected: skillsHubSummary.catalogProjected,
      skillsHubCatalogTotal: skillsHubSummary.catalogTotal,
      skillsHubManifestCount: skillsHubSummary.exportedManifests,
      skillsHubInstalledTotal: skillsHubSummary.installedTotal,
      skillsHubFamilyTotal: skillsHubSummary.familyTotal,
      nativeOwnershipControlPlane: dependencies.nativeOwnership.controlPlane(),
      nativeOwnershipSnapshot: dependencies.nativeOwnership.snapshotSync(),
    };
  };
}
