import type {
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
} from "@/runtime/native/service-bridge";
import type { ToolDefinition } from "@/types";

type NativeOwnershipControlPlane = ReturnType<
  typeof getNativeOwnershipControlPlane
>;
type NativeOwnershipSnapshot = Awaited<
  ReturnType<typeof getNativeOwnershipSnapshot>
>;

interface ToolRegistryDynamicState {
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
}

interface ToolRegistrySummary {
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
    laggingLatestPackages: number;
  };
}

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
    }),
  ) {}

  private readonly tools: ToolDefinition[] = [
    {
      id: "workspace.tree",
      name: "Workspace Tree",
      category: "workspace",
      description: "List the current workspace tree.",
      enabled: true,
      transport: "service",
    },
    {
      id: "workspace.read",
      name: "Workspace Read",
      category: "workspace",
      description: "Read a file from the configured workspace.",
      enabled: true,
      transport: "service",
    },
    {
      id: "workspace.search",
      name: "Workspace Search",
      category: "workspace",
      description: "Search across workspace files.",
      enabled: true,
      transport: "service",
    },
    {
      id: "terminal.run",
      name: "Terminal Run",
      category: "terminal",
      description: "Execute a command on the active execution backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "repository.status",
      name: "Repository Status",
      category: "repository",
      description: "Inspect git status for the current repository.",
      enabled: true,
      transport: "service",
    },
    {
      id: "documents.pdf.extract",
      name: "PDF Extract",
      category: "documents",
      description: "Extract text from PDF files through the PDF service.",
      enabled: true,
      transport: "service",
    },
    {
      id: "web.fetch",
      name: "Web Fetch",
      category: "documents",
      description:
        "Fetch and extract readable text from a URL through the configured browser backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.status",
      name: "Browser Status",
      category: "documents",
      description: "Inspect the configured browser automation backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.snapshot",
      name: "Browser Snapshot",
      category: "documents",
      description: "Create a text snapshot artifact for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.screenshot",
      name: "Browser Screenshot",
      category: "documents",
      description:
        "Create a lightweight screenshot artifact placeholder for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.capture",
      name: "Browser Capture Bundle",
      category: "documents",
      description:
        "Create a reusable bundle with snapshot, screenshot, report, and manifest artifacts for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.analyze",
      name: "Browser Analyze",
      category: "documents",
      description:
        "Create a model-backed analysis brief for a browser capture.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.compare",
      name: "Browser Compare",
      category: "documents",
      description:
        "Compare two captures and emit a diff-style browser report bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.compare.analyze",
      name: "Browser Compare Analyze",
      category: "documents",
      description:
        "Create a model-backed analysis brief for a browser comparison bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.inspect",
      name: "Media Inspect",
      category: "documents",
      description: "Inspect local media files for type and size metadata.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.analyze",
      name: "Media Analyze",
      category: "documents",
      description:
        "Create a model-backed analysis brief for audio, image, or document media.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.voice",
      name: "Media Voice",
      category: "documents",
      description:
        "Create a voice-focused model-backed analysis brief for audio or video media.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.transcribe",
      name: "Media Transcribe",
      category: "documents",
      description:
        "Create a provider-native transcription or best-effort transcript bundle for audio and video media.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.speak",
      name: "Media Speak",
      category: "documents",
      description:
        "Generate provider-native Eliza Agent speech audio or an offline speech concept bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.vision",
      name: "Media Vision",
      category: "documents",
      description:
        "Create a vision-focused model-backed analysis brief for image media.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.bundle",
      name: "Media Bundle",
      category: "documents",
      description:
        "Package a media file with its sidecars and extracted metadata into a reusable report bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.generate",
      name: "Media Generate",
      category: "documents",
      description:
        "Generate a model-assisted image concept artifact from a prompt.",
      enabled: true,
      transport: "service",
    },
    {
      id: "gateway.send",
      name: "Gateway Send",
      category: "gateway",
      description: "Send a response through the active gateway adapter.",
      enabled: true,
      transport: "adapter",
    },
    {
      id: "acp.status",
      name: "ACP Status",
      category: "protocol",
      description: "Inspect the ACP bridge and Eliza Agent registry surface.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.registry",
      name: "ACP Registry",
      category: "protocol",
      description:
        "Publish the Eliza Agent ACP registry manifest for editor integrations.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.package",
      name: "ACP Package Metadata",
      category: "protocol",
      description:
        "Inspect ACP package metadata, workspace packaging, and registry identity.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.editor",
      name: "ACP Editor Summary",
      category: "protocol",
      description:
        "Inspect ACP editor install, registry, export, and import integration details.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.sessions",
      name: "ACP Session Summary",
      category: "protocol",
      description:
        "Expose ACP-visible session counts, recent session ids, and titled session summaries.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.export",
      name: "ACP Export",
      category: "protocol",
      description:
        "Export ACP package, registry, session, and tool metadata into a reusable bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.import",
      name: "ACP Import",
      category: "protocol",
      description:
        "Import ACP bundle metadata from a file path or JSON payload into the local ACP workspace.",
      enabled: true,
      transport: "service",
    },
    {
      id: "acp.tools",
      name: "ACP Tool Catalog",
      category: "protocol",
      description:
        "Expose Eliza Agent tools as ACP-style tool definitions with kind metadata.",
      enabled: true,
      transport: "service",
    },
    {
      id: "plugins.native",
      name: "Native Plugin Inventory",
      category: "runtime",
      description:
        "Inspect the native ElizaOS plugin catalog, grouped categories, and service registry alignment.",
      enabled: true,
      transport: "native",
    },
    {
      id: "packages.native",
      name: "Native Package Audit",
      category: "runtime",
      description:
        "Inspect latest-line ElizaOS package compatibility across official, alpha-only, vendored, and workspace-bound packages.",
      enabled: true,
      transport: "native",
    },
    {
      id: "automation.cron",
      name: "Cron Automation",
      category: "automation",
      description: "Create and inspect scheduled automation jobs.",
      enabled: true,
      transport: "service",
    },
    {
      id: "automation.trajectory.export",
      name: "Trajectory Export",
      category: "automation",
      description: "Export recent interaction trajectories to JSONL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "automation.trajectory.analyze",
      name: "Trajectory Analyze",
      category: "automation",
      description:
        "Create a model-backed research brief from a trajectory bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "automation.trajectory.evaluate",
      name: "Trajectory Evaluate",
      category: "automation",
      description:
        "Score a trajectory bundle and emit a research evaluation report.",
      enabled: true,
      transport: "service",
    },
    {
      id: "automation.trajectory.package",
      name: "Trajectory Package",
      category: "automation",
      description:
        "Package export, replay, analysis, and evaluation artifacts into a reusable research bundle.",
      enabled: true,
      transport: "service",
    },
    {
      id: "skills.synthesize",
      name: "Skill Synthesis",
      category: "automation",
      description:
        "Create draft reusable skills from completed delegated work.",
      enabled: true,
      transport: "service",
    },
    {
      id: "mcp.bridge",
      name: "MCP Bridge",
      category: "mcp",
      description: "Structured MCP bridge for tool discovery and invocation.",
      enabled: true,
      transport: "native",
    },
    {
      id: "runtime.registry",
      name: "Registry Snapshot",
      category: "runtime",
      description:
        "Inspect the ElizaOS registry client snapshot and endpoint state.",
      enabled: true,
      transport: "native",
    },
    {
      id: "runtime.compatibility",
      name: "Compatibility Report",
      category: "runtime",
      description:
        "Inspect plugin-to-core compatibility results from the Eliza agent SDK.",
      enabled: true,
      transport: "native",
    },
    {
      id: "runtime.autonomous",
      name: "Autonomous Control Plane",
      category: "runtime",
      description:
        "Inspect native Eliza agent-skills, orchestrator, trajectory, and plugin-manager adoption.",
      enabled: true,
      transport: "native",
    },
    {
      id: "runtime.ownership",
      name: "Ownership Snapshot",
      category: "runtime",
      description:
        "Inspect the shared native ownership snapshot across control plane, integration, autonomous, and skill hub surfaces.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.catalog",
      name: "Skill Catalog",
      category: "runtime",
      description:
        "Inspect the ElizaOS skill catalog cache and trending skill metadata.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.hub",
      name: "Skill Hub",
      category: "runtime",
      description:
        "Inspect the native Eliza skill hub summary, installed manifests, and distribution sync state.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.families",
      name: "Skill Families",
      category: "runtime",
      description:
        "Inspect curated and generated Eliza skill families with workspace, catalog, and install coverage.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.family",
      name: "Skill Family",
      category: "runtime",
      description:
        "Inspect a single skill family by slug for detailed hub coverage.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.installed",
      name: "Installed Skills",
      category: "runtime",
      description:
        "Inspect installed skill manifests and their distribution metadata.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.export",
      name: "Skill Export",
      category: "runtime",
      description: "Export a workspace or catalog skill manifest.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.import",
      name: "Skill Import",
      category: "runtime",
      description: "Import a manifest into the local Eliza skill hub.",
      enabled: true,
      transport: "native",
    },
    {
      id: "skills.install",
      name: "Skill Install",
      category: "runtime",
      description: "Install a catalog skill into the local Eliza skill hub.",
      enabled: true,
      transport: "native",
    },
  ];

  list(): ToolDefinition[] {
    const dynamic = this.getDynamicState();
    const baseTools = this.tools.map((tool) =>
      tool.id === "mcp.bridge"
        ? {
            ...tool,
            enabled: dynamic.mcpEnabled,
            description: dynamic.mcpEnabled
              ? `Structured MCP bridge enabled with ${dynamic.discoveredMcpTools} discovered tool(s)${
                  dynamic.discoveredMcpToolNames?.length
                    ? `: ${dynamic.discoveredMcpToolNames.slice(0, 5).join(", ")}`
                    : ""
                }.`
              : "Structured MCP bridge is available but not configured.",
          }
        : tool.id === "plugins.native"
          ? {
              ...tool,
              description: dynamic.nativeOwnershipControlPlane?.pluginManager
                ?.summary
                ? `Native ElizaOS stack includes ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.enabled}/${dynamic.nativeOwnershipControlPlane.pluginManager.summary.total} enabled plugin definitions across ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.categories} categories, with ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.official} official and ${dynamic.nativeOwnershipControlPlane.pluginManager.summary.vendored} vendored packages.`
                : `Native ElizaOS stack includes ${dynamic.nativePluginManagerEnabled ?? 0}/${dynamic.nativePluginManagerTotal ?? 0} enabled plugin definitions across ${dynamic.nativePluginManagerCategories ?? 0} categories, with ${dynamic.nativePluginManagerOfficial ?? 0} official and ${dynamic.nativePluginManagerVendored ?? 0} vendored packages.`,
            }
          : tool.id === "packages.native"
            ? {
                ...tool,
                description: `Latest runtime=${dynamic.nativeRuntimeLatest ?? "unknown"} alpha=${dynamic.nativeRuntimeAlpha ?? "unknown"} aligned=${dynamic.nativeAlignedPackages ?? 0} alphaOnly=${dynamic.nativeAlphaOnlyPackages ?? 0} laggingLatest=${dynamic.nativeLaggingLatestPackages ?? 0} workspaceOnly=${dynamic.nativeWorkspaceOnlyPackages ?? 0}.`,
              }
            : tool.id === "runtime.registry"
              ? {
                  ...tool,
                  description: dynamic.agentSdkRegistryAvailable
                    ? `ElizaOS registry snapshot available with ${dynamic.agentSdkRegistryPlugins ?? 0} plugin entries.`
                    : "ElizaOS registry snapshot is unavailable in the current environment.",
                }
              : tool.id === "runtime.compatibility"
                ? {
                    ...tool,
                    description:
                      (dynamic.agentSdkCompatibilityFailures ?? 0) > 0
                        ? `ElizaOS compatibility reported ${dynamic.agentSdkCompatibilityFailures ?? 0} plugin/core mismatch(es).`
                        : "ElizaOS compatibility checks are currently clean.",
                  }
                : tool.id === "runtime.ownership"
                  ? {
                      ...tool,
                      description:
                        dynamic.nativeOwnershipControlPlane ||
                        dynamic.nativeOwnershipSnapshot
                          ? `Shared ownership snapshot: services=${dynamic.nativeOwnershipControlPlane?.serviceResolution.length ?? 0} operational=${dynamic.nativeOwnershipControlPlane?.transportControl.totals.operationalTransports ?? 0} pluginManager=${dynamic.nativeOwnershipControlPlane?.pluginManager?.summary.enabled ?? 0} skillHub=${dynamic.nativeOwnershipSnapshot?.skillHub.workspaceTotal ?? dynamic.skillsHubTotal ?? 0}/${dynamic.nativeOwnershipSnapshot?.skillHub.installedTotal ?? dynamic.skillsHubInstalledTotal ?? 0}.`
                          : "Shared native ownership snapshot is unavailable in the current environment.",
                    }
                  : tool.id === "skills.catalog"
                    ? {
                        ...tool,
                        description: dynamic.agentSdkCatalogAvailable
                          ? `ElizaOS skill catalog available with ${dynamic.agentSdkCatalogSkills ?? 0} cached skills.`
                          : "ElizaOS skill catalog is unavailable in the current environment.",
                      }
                    : tool.id === "skills.hub"
                      ? {
                          ...tool,
                          description: dynamic.nativeOwnershipSnapshot
                            ? `Skills hub summary=${dynamic.nativeOwnershipSnapshot.skillHub.workspaceTotal} generated=${dynamic.nativeOwnershipSnapshot.skillHub.generatedTotal} catalog=${dynamic.nativeOwnershipSnapshot.skillHub.catalogTotal} manifests=${dynamic.nativeOwnershipSnapshot.skillHub.exportedManifests} installed=${dynamic.nativeOwnershipSnapshot.skillHub.installedTotal} families=${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}.`
                            : `Skills hub summary=${dynamic.skillsHubTotal ?? 0} generated=${dynamic.skillsHubGenerated ?? 0} catalog=${dynamic.skillsHubCatalogTotal ?? 0} manifests=${dynamic.skillsHubManifestCount ?? 0} installed=${dynamic.skillsHubInstalledTotal ?? 0} families=${dynamic.skillsHubFamilyTotal ?? 0}.`,
                        }
                      : tool.id === "skills.families"
                        ? {
                            ...tool,
                            description: dynamic.nativeOwnershipSnapshot
                              ? `Curated and generated skill families available: ${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}.`
                              : `Curated and generated skill families available: ${dynamic.skillsHubFamilyTotal ?? 0}.`,
                          }
                        : tool.id === "skills.family"
                          ? {
                              ...tool,
                              description: dynamic.nativeOwnershipSnapshot
                                ? `Inspect a single skill family from the ${dynamic.nativeOwnershipSnapshot.skillHub.familyTotal}-family hub.`
                                : `Inspect a single skill family from the ${dynamic.skillsHubFamilyTotal ?? 0}-family hub.`,
                            }
                          : tool.id === "skills.installed"
                            ? {
                                ...tool,
                                description: dynamic.nativeOwnershipSnapshot
                                  ? `Installed skill manifests available: ${dynamic.nativeOwnershipSnapshot.skillHub.installedTotal}.`
                                  : `Installed skill manifests available: ${dynamic.skillsHubInstalledTotal ?? 0}.`,
                              }
                            : tool,
    );
    const pluginTools =
      dynamic.nativeCatalog?.map<ToolDefinition>((plugin) => ({
        id: `plugins.native.${plugin.id}`,
        name: `Native Plugin ${plugin.id}`,
        category: "runtime",
        description: `${plugin.source} ${plugin.category} plugin: ${plugin.notes}`,
        enabled: plugin.enabled,
        transport: "native",
      })) ?? [];
    return [...baseTools, ...pluginTools];
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
    const categories = Object.entries(this.grouped()).map(
      ([category, entries]) => ({
        category,
        total: entries.length,
        enabled: entries.filter((tool) => tool.enabled).length,
      }),
    );
    const dynamic = this.getDynamicState();
    const nativeOwnershipControlPlane =
      dynamic.nativeOwnershipControlPlane ?? null;
    const nativeOwnershipSnapshot = dynamic.nativeOwnershipSnapshot ?? null;
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
        skillHubTotal:
          nativeOwnershipSnapshot?.skillHub.workspaceTotal ??
          dynamic.skillsHubTotal ??
          0,
        skillHubGenerated:
          nativeOwnershipSnapshot?.skillHub.generatedTotal ??
          dynamic.skillsHubGenerated ??
          0,
        skillHubCatalogTotal:
          nativeOwnershipSnapshot?.skillHub.catalogTotal ??
          dynamic.skillsHubCatalogTotal ??
          0,
        skillHubManifestCount:
          nativeOwnershipSnapshot?.skillHub.exportedManifests ??
          dynamic.skillsHubManifestCount ??
          0,
        skillHubInstalledTotal:
          nativeOwnershipSnapshot?.skillHub.installedTotal ??
          dynamic.skillsHubInstalledTotal ??
          0,
        skillHubFamilyTotal:
          nativeOwnershipSnapshot?.skillHub.familyTotal ??
          dynamic.skillsHubFamilyTotal ??
          0,
        nativeServices:
          nativeOwnershipControlPlane?.serviceResolution.filter(
            (entry) => entry.source === "native",
          ).length ?? 0,
        productFallbacks:
          nativeOwnershipControlPlane?.serviceResolution.filter(
            (entry) => entry.source === "product",
          ).length ?? 0,
      },
      ecosystem: {
        registryAvailable: dynamic.agentSdkRegistryAvailable ?? false,
        registryPlugins: dynamic.agentSdkRegistryPlugins ?? 0,
        skillCatalogAvailable: dynamic.agentSdkCatalogAvailable ?? false,
        skillCatalogSkills: dynamic.agentSdkCatalogSkills ?? 0,
        compatibilityFailures: dynamic.agentSdkCompatibilityFailures ?? 0,
        skillsHubTotal:
          nativeOwnershipSnapshot?.skillHub.workspaceTotal ??
          dynamic.skillsHubTotal ??
          0,
        skillsHubGenerated:
          nativeOwnershipSnapshot?.skillHub.generatedTotal ??
          dynamic.skillsHubGenerated ??
          0,
        skillsHubCatalogTotal:
          nativeOwnershipSnapshot?.skillHub.catalogTotal ??
          dynamic.skillsHubCatalogTotal ??
          0,
        skillsHubManifestCount:
          nativeOwnershipSnapshot?.skillHub.exportedManifests ??
          dynamic.skillsHubManifestCount ??
          0,
        skillsHubInstalledTotal:
          nativeOwnershipSnapshot?.skillHub.installedTotal ??
          dynamic.skillsHubInstalledTotal ??
          0,
        skillsHubFamilyTotal:
          nativeOwnershipSnapshot?.skillHub.familyTotal ??
          dynamic.skillsHubFamilyTotal ??
          0,
        laggingLatestPackages: dynamic.nativeLaggingLatestPackages ?? 0,
      },
    };
  }
}
