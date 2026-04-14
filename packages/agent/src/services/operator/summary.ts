import type { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";
import type { AgentSdkService } from "@/services/agent-sdk-service";
import type { AutocoderPipelineService } from "@/services/autocoder-pipeline/service";
import type { EcosystemService } from "@/services/ecosystem-service";

type OwnershipControlPlane = ReturnType<typeof getNativeOwnershipControlPlane>;

export interface OperatorCondensedSummary {
  ownership?: {
    serviceResolution: number;
    pluginManager: {
      available: boolean;
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
    identity?: {
      personality: number;
      rolodex: number;
      experience: number;
    };
  };
  ecosystem: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    benchmarkPacks?: number;
    distributionChannels?: number;
    modelingProfiles?: number;
    optionalSkillPacks?: number;
  };
  pluginManager: {
    available: boolean;
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  pipeline?: {
    total: number;
    workflows: number;
    failed: number;
    failedWorkflows: number;
    latestKind?: string;
    latestTarget?: string;
  };
}

export function buildOperatorCondensedSummary(input: {
  ownership?: OwnershipControlPlane;
  ecosystem?: Awaited<ReturnType<AgentSdkService["overview"]>>;
  workspaceEcosystem?: ReturnType<EcosystemService["summary"]>;
  pipeline?: ReturnType<AutocoderPipelineService["summary"]>;
}): OperatorCondensedSummary {
  const { ownership, ecosystem, workspaceEcosystem, pipeline } = input;
  const pluginManager = ownership?.pluginManager ?? null;
  const identity = ownership?.identity;

  return {
    ownership: ownership
      ? {
          serviceResolution: ownership.serviceResolution.length,
          pluginManager: {
            available: Boolean(ownership.pluginManager),
            total: ownership.pluginManager?.summary.total ?? 0,
            enabled: ownership.pluginManager?.summary.enabled ?? 0,
            official: ownership.pluginManager?.summary.official ?? 0,
            vendored: ownership.pluginManager?.summary.vendored ?? 0,
            categories: ownership.pluginManager?.summary.categories ?? 0,
          },
          ...(identity
            ? {
                identity: {
                  personality: identity.personality.total,
                  rolodex: identity.rolodex.totalProfiles,
                  experience: identity.experience.sessions.totalSessions,
                },
              }
            : {}),
        }
      : undefined,
    ecosystem: {
      registryAvailable: ecosystem?.registry.available ?? false,
      registryPlugins: ecosystem?.registry.total ?? 0,
      skillCatalogAvailable: ecosystem?.skillCatalog.available ?? false,
      skillCatalogSkills: ecosystem?.skillCatalog.total ?? 0,
      compatibilityFailures: ecosystem?.summary.compatibilityFailures ?? 0,
      benchmarkPacks: workspaceEcosystem?.benchmarkPacks ?? 0,
      distributionChannels: workspaceEcosystem?.distributionChannels ?? 0,
      modelingProfiles: workspaceEcosystem?.modelingProfiles ?? 0,
      optionalSkillPacks: workspaceEcosystem?.optionalSkillPacks ?? 0,
    },
    pluginManager: {
      available: Boolean(pluginManager),
      total: pluginManager?.summary.total ?? 0,
      enabled: pluginManager?.summary.enabled ?? 0,
      official: pluginManager?.summary.official ?? 0,
      vendored: pluginManager?.summary.vendored ?? 0,
      categories: pluginManager?.summary.categories ?? 0,
    },
    pipeline: pipeline
      ? {
          total: pipeline.total,
          workflows: pipeline.workflows,
          failed: pipeline.failed,
          failedWorkflows: pipeline.failedWorkflows,
          latestKind: pipeline.latest?.kind,
          latestTarget:
            pipeline.latest?.projectName ?? pipeline.latest?.repositoryName,
        }
      : undefined,
  };
}
