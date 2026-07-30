import {
  getAgentRegistrySnapshot,
  getAgentSdkAudit,
  searchAgentRegistry,
} from "@/runtime/native/agent-sdk";

type AgentSdkAudit = Awaited<ReturnType<typeof getAgentSdkAudit>>;
type AgentRegistrySnapshot = Awaited<
  ReturnType<typeof getAgentRegistrySnapshot>
>;
export interface AgentSdkOverview {
  audit: AgentSdkAudit;
  registry: AgentRegistrySnapshot;
  summary: {
    foundationPackages: number;
    installedFoundationPackages: number;
    ecosystemPackages: number;
    installedEcosystemPackages: number;
    compatibilityChecks: number;
    compatibilityFailures: number;
    registryEndpoints: number;
    registryPlugins: number;
    nonAppPlugins: number;
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

export class AgentSdkService {
  private auditCache?: AgentSdkAudit;
  private registryCache?: AgentRegistrySnapshot;

  snapshot() {
    return {
      audit: this.auditCache,
      registry: this.registryCache,
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

  async overview(force = false): Promise<AgentSdkOverview> {
    const [audit, registry] = await Promise.all([
      this.audit(force),
      this.registry(force),
    ]);

    return {
      audit,
      registry,
      summary: {
        foundationPackages: audit.foundationPackages.length,
        installedFoundationPackages: countInstalledFoundationPackages(
          audit.installed,
        ),
        ecosystemPackages: audit.ecosystemPackages?.length ?? 0,
        installedEcosystemPackages: countInstalledEcosystemPackages(
          audit.ecosystemInstalled,
        ),
        compatibilityChecks: audit.compatibility.length,
        compatibilityFailures: audit.compatibility.filter(
          (entry) => !entry.compatible,
        ).length,
        registryEndpoints: registry.endpoints?.length ?? 0,
        registryPlugins: registry.total ?? 0,
        nonAppPlugins: registry.nonAppPlugins ?? 0,
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
    const [audit, registry] = await Promise.all([
      this.audit().catch(() => undefined),
      this.registry().catch(() => undefined),
    ]);
    return {
      audit,
      registry,
    };
  }
}
