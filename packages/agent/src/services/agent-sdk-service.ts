import {
  getAgentRegistrySnapshot,
  getAgentSdkAudit,
  getAgentSkillCatalogSnapshot,
  searchAgentRegistry,
  searchAgentSkillCatalog,
} from "@/runtime/native/agent-sdk";

type AgentSdkAudit = Awaited<ReturnType<typeof getAgentSdkAudit>>;
type AgentRegistrySnapshot = Awaited<
  ReturnType<typeof getAgentRegistrySnapshot>
>;
type AgentSkillCatalogSnapshot = Awaited<
  ReturnType<typeof getAgentSkillCatalogSnapshot>
>;

export interface AgentSdkOverview {
  audit: AgentSdkAudit;
  registry: AgentRegistrySnapshot;
  skillCatalog: AgentSkillCatalogSnapshot;
  summary: {
    foundationPackages: number;
    installedFoundationPackages: number;
    compatibilityChecks: number;
    registryEndpoints: number;
    registryPlugins: number;
    nonAppPlugins: number;
    skillCatalogSkills: number;
    trendingSkills: number;
  };
}

function countInstalledFoundationPackages(
  installed: AgentSdkAudit["installed"],
): number {
  return Object.values(installed).filter(Boolean).length;
}

export class AgentSdkService {
  private auditCache?: AgentSdkAudit;
  private registryCache?: AgentRegistrySnapshot;
  private skillCatalogCache?: AgentSkillCatalogSnapshot;

  snapshot() {
    return {
      audit: this.auditCache,
      registry: this.registryCache,
      skillCatalog: this.skillCatalogCache,
    };
  }

  async audit(force = false) {
    if (!force && this.auditCache) {
      return this.auditCache;
    }
    this.auditCache = await getAgentSdkAudit();
    return this.auditCache;
  }

  async registry(force = false, limit = 20) {
    if (!force && this.registryCache) {
      return this.registryCache;
    }
    this.registryCache = await getAgentRegistrySnapshot(limit);
    return this.registryCache;
  }

  async searchRegistry(query: string, limit = 15) {
    return searchAgentRegistry(query, limit);
  }

  async skillCatalog(force = false, limit = 20) {
    if (!force && this.skillCatalogCache) {
      return this.skillCatalogCache;
    }
    this.skillCatalogCache = await getAgentSkillCatalogSnapshot(limit);
    return this.skillCatalogCache;
  }

  async searchSkillCatalog(query: string, limit = 15) {
    return searchAgentSkillCatalog(query, limit);
  }

  async overview(force = false): Promise<AgentSdkOverview> {
    const [audit, registry, skillCatalog] = await Promise.all([
      this.audit(force),
      this.registry(force),
      this.skillCatalog(force),
    ]);

    return {
      audit,
      registry,
      skillCatalog,
      summary: {
        foundationPackages: audit.foundationPackages.length,
        installedFoundationPackages: countInstalledFoundationPackages(
          audit.installed,
        ),
        compatibilityChecks: audit.compatibility.length,
        registryEndpoints: registry.endpoints?.length ?? 0,
        registryPlugins: registry.total ?? 0,
        nonAppPlugins: registry.nonAppPlugins ?? 0,
        skillCatalogSkills:
          skillCatalog.total ?? audit.skillCatalog.cachedSkills ?? 0,
        trendingSkills: skillCatalog.trending?.length ?? 0,
      },
    };
  }

  async prime() {
    const [audit, registry, skillCatalog] = await Promise.all([
      this.audit().catch(() => undefined),
      this.registry().catch(() => undefined),
      this.skillCatalog().catch(() => undefined),
    ]);
    return {
      audit,
      registry,
      skillCatalog,
    };
  }
}
