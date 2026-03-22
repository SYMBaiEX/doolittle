import {
  getAgentCatalogSkill,
  getAgentCatalogSkills,
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
type AgentCatalogSkill = Awaited<
  ReturnType<typeof getAgentCatalogSkills>
>[number];

export interface AgentSdkOverview {
  audit: AgentSdkAudit;
  registry: AgentRegistrySnapshot;
  skillCatalog: AgentSkillCatalogSnapshot;
  summary: {
    foundationPackages: number;
    installedFoundationPackages: number;
    ecosystemPackages: number;
    installedEcosystemPackages: number;
    supportPackages: number;
    installedSupportPackages: number;
    compatibilityChecks: number;
    compatibilityFailures: number;
    registryEndpoints: number;
    registryPlugins: number;
    nonAppPlugins: number;
    skillCatalogSkills: number;
    trendingSkills: number;
  };
}

export interface AgentSdkCompatibilityReport {
  coreVersion: string;
  compatible: boolean;
  checked: number;
  failures: number;
  results: AgentSdkAudit["compatibility"];
  failing: AgentSdkAudit["compatibility"];
}

function countInstalledFoundationPackages(
  installed: AgentSdkAudit["installed"],
): number {
  return Object.values(installed).filter(Boolean).length;
}

function countInstalledEcosystemPackages(
  installed: AgentSdkAudit["ecosystemInstalled"],
): number {
  return Object.values(installed ?? {}).filter(Boolean).length;
}

function countInstalledSupportPackages(
  installed: AgentSdkAudit["supportInstalled"],
): number {
  return Object.values(installed ?? {}).filter(Boolean).length;
}

export class AgentSdkService {
  private auditCache?: AgentSdkAudit;
  private registryCache?: AgentRegistrySnapshot;
  private skillCatalogCache?: AgentSkillCatalogSnapshot;
  private catalogCache?: AgentCatalogSkill[];

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

  async catalog(force = false, limit = 50): Promise<AgentCatalogSkill[]> {
    if (!force && this.catalogCache) {
      return this.catalogCache.slice(0, limit);
    }
    this.catalogCache = await getAgentCatalogSkills();
    return this.catalogCache.slice(0, limit);
  }

  async catalogSkill(slug: string) {
    return getAgentCatalogSkill(slug);
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
        ecosystemPackages: audit.ecosystemPackages?.length ?? 0,
        installedEcosystemPackages: countInstalledEcosystemPackages(
          audit.ecosystemInstalled,
        ),
        supportPackages: audit.supportPackages?.length ?? 0,
        installedSupportPackages: countInstalledSupportPackages(
          audit.supportInstalled,
        ),
        compatibilityChecks: audit.compatibility.length,
        compatibilityFailures: audit.compatibility.filter(
          (entry) => !entry.compatible,
        ).length,
        registryEndpoints: registry.endpoints?.length ?? 0,
        registryPlugins: registry.total ?? 0,
        nonAppPlugins: registry.nonAppPlugins ?? 0,
        skillCatalogSkills:
          skillCatalog.total ?? audit.skillCatalog.cachedSkills ?? 0,
        trendingSkills: skillCatalog.trending?.length ?? 0,
      },
    };
  }

  async compatibility(force = false): Promise<AgentSdkCompatibilityReport> {
    const audit = await this.audit(force);
    const failing = audit.compatibility.filter((entry) => !entry.compatible);
    return {
      coreVersion: audit.coreVersion,
      compatible: failing.length === 0,
      checked: audit.compatibility.length,
      failures: failing.length,
      results: audit.compatibility,
      failing,
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
