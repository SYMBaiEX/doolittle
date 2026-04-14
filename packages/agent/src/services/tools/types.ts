import type {
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
} from "@/runtime/native/service-bridge/ownership";

type NativeOwnershipControlPlane = ReturnType<
  typeof getNativeOwnershipControlPlane
>;
type NativeOwnershipSnapshot = Awaited<
  ReturnType<typeof getNativeOwnershipSnapshot>
>;

export interface ToolRegistryDynamicState {
  mcpEnabled: boolean;
  discoveredMcpTools: number;
  discoveredMcpToolNames?: string[];
  acpEnabled?: boolean;
  nativePluginManagerTotal?: number;
  nativePluginManagerEnabled?: number;
  nativePluginManagerOfficial?: number;
  nativePluginManagerVendored?: number;
  nativePluginManagerCategories?: number;
  nativeCatalog?: Array<{
    id: string;
    category: string;
    source: string;
    enabled: boolean;
    notes: string;
  }>;
  nativeOwnershipControlPlane?: NativeOwnershipControlPlane;
  nativeOwnershipSnapshot?: NativeOwnershipSnapshot;
  nativeRuntimeLatest?: string;
  nativeRuntimeAlpha?: string;
  nativeAlignedPackages?: number;
  nativeAlphaOnlyPackages?: number;
  nativeLaggingLatestPackages?: number;
  nativeWorkspaceOnlyPackages?: number;
  agentSdkRegistryAvailable?: boolean;
  agentSdkRegistryPlugins?: number;
  agentSdkCatalogAvailable?: boolean;
  agentSdkCatalogSkills?: number;
  agentSdkCompatibilityFailures?: number;
  skillsHubTotal?: number;
  skillsHubGenerated?: number;
  skillsHubCatalogTotal?: number;
  skillsHubManifestCount?: number;
  skillsHubInstalledTotal?: number;
  skillsHubFamilyTotal?: number;
  ecosystemBenchmarkPacks?: number;
  ecosystemDistributionChannels?: number;
  ecosystemModelingProfiles?: number;
}

export interface ToolRegistrySummary {
  total: number;
  enabled: number;
  disabled: number;
  transports: Array<{
    transport: string;
    total: number;
    enabled: number;
  }>;
  categories: Array<{
    category: string;
    total: number;
    enabled: number;
  }>;
  mcp: {
    enabled: boolean;
    discoveredTools: number;
    discoveredToolNames: string[];
  };
  native: {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  ownership: {
    serviceResolution: number;
    operationalTransports: number;
    pluginManagerEnabled: number;
    pluginManagerOfficial: number;
    pluginManagerVendored: number;
    skillHubTotal: number;
    skillHubGenerated: number;
    skillHubCatalogTotal: number;
    skillHubManifestCount: number;
    skillHubInstalledTotal: number;
    skillHubFamilyTotal: number;
    nativeServices: number;
    productFallbacks: number;
  };
  ecosystem: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    skillsHubTotal: number;
    skillsHubGenerated: number;
    skillsHubCatalogTotal: number;
    skillsHubManifestCount: number;
    skillsHubInstalledTotal: number;
    skillsHubFamilyTotal: number;
    benchmarkPacks: number;
    distributionChannels: number;
    modelingProfiles: number;
    laggingLatestPackages: number;
  };
}
