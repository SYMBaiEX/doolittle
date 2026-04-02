import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/index";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog/index";
import { getTuiTheme, listTuiThemes } from "@/runtime/theme-catalog";
import type { AppServices } from "@/services";
import type { MemorySummary } from "@/services/memory-service";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { UserProfileWorkspaceSummary } from "@/types/user-profile";
import {
  type AutonomousControlPlaneSummary,
  getAutonomousControlPlane,
} from "../autonomous";
import {
  getEffectivePluginManagerInventory,
  getEffectiveServiceResolution,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativePlanningControlPlane,
  getNativeResearchControlPlane,
  getNativeTransportControlPlane,
  type NativeIntegrationControlPlane,
} from "../control-planes";
import { getNativeServices, type RuntimeLike } from "../runtime";

interface NativePersonalitySummary {
  total: number;
  activeId?: string;
  names: string[];
}

interface NativeRolodexSummary extends UserProfileWorkspaceSummary {}

interface NativeExperienceSummary {
  sessions: {
    totalSessions: number;
    recentSessionIds: string[];
  };
  memory: {
    shared: MemorySummary;
    user: MemorySummary;
  };
}

interface NativeOwnershipControlPlaneSummary {
  serviceResolution: ReturnType<typeof getEffectiveServiceResolution>;
  transportControl: ReturnType<typeof getNativeTransportControlPlane>;
  pluginManager: ReturnType<typeof getEffectivePluginManagerInventory> | null;
  identity?: {
    personality: NativePersonalitySummary;
    rolodex: NativeRolodexSummary;
    experience: NativeExperienceSummary;
  };
  ecosystem?: ReturnType<AppServices["ecosystem"]["summary"]>;
}

interface NativeOwnershipSnapshot {
  controlPlane: NativeOwnershipControlPlaneSummary;
  integration: NativeIntegrationControlPlane;
  autonomous: AutonomousControlPlaneSummary;
  ui: {
    active: ReturnType<typeof getTuiTheme>;
    themes: ReturnType<typeof listTuiThemes>;
  };
  skillHub: ReturnType<AppServices["skillsHub"]["summary"]>;
  ecosystem: ReturnType<AppServices["ecosystem"]["summary"]>;
  media: ReturnType<typeof getNativeMediaControlPlane>;
  research: ReturnType<typeof getNativeResearchControlPlane>;
  forms: ReturnType<typeof getNativeFormsControlPlane>;
  planning: ReturnType<typeof getNativePlanningControlPlane>;
  execution: ReturnType<typeof getNativeExecutionControlPlane>;
}

interface NativeEcosystemSnapshot {
  runtime: {
    latest: string;
    alpha: string;
  };
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>;
  packageAudit: ReturnType<typeof getNativePackageAudit>;
  pluginCatalog: ReturnType<typeof getNativePluginCatalog>;
  sdk: Awaited<ReturnType<AppServices["agentSdk"]["overview"]>>;
  workspace: {
    summary: ReturnType<AppServices["ecosystem"]["summary"]>;
    benchmarks: ReturnType<AppServices["ecosystem"]["benchmarkPacks"]>;
    channels: ReturnType<AppServices["ecosystem"]["distributionChannels"]>;
    modeling: ReturnType<AppServices["ecosystem"]["modelingProfiles"]>;
    optionalSkillPacks: ReturnType<
      AppServices["ecosystem"]["optionalSkillPacks"]
    >;
  };
  ownership: NativeOwnershipSnapshot;
}

export function getEffectiveMemorySnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  target: "memory" | "user" = "memory",
): MemorySummary {
  return (getNativeServices(runtime).knowledge?.summary?.(target) ??
    services.memory.summary(target)) as MemorySummary;
}

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativePersonalitySummary {
  return (getNativeServices(runtime).personality?.summary?.() ?? {
    ...(services.personalities?.summary?.() ?? {
      total: 0,
      names: [],
    }),
  }) as NativePersonalitySummary;
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return (getNativeServices(runtime).rolodex?.summary?.() ?? {
    ...services.userProfiles.summary(),
  }) as NativeRolodexSummary;
}

export function getEffectiveUserProfileSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return getEffectiveRolodexSummary(runtime, services);
}

export function getEffectiveUserProfileSearch(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 10,
) {
  return (
    getNativeServices(runtime).rolodex?.search?.(query, limit) ??
    services.userProfiles.search(query, limit)
  );
}

export function getEffectiveUserBeliefs(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.beliefs?.(userId) ??
    services.userProfiles.beliefs(userId)
  );
}

export function getEffectiveUserRelationship(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.relationship?.(userId) ??
    services.userProfiles.relationship(userId)
  );
}

export function getEffectiveUserEngagement(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.engagement?.(userId) ??
    services.userProfiles.engagement(userId)
  );
}

export function getEffectiveExperienceSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeExperienceSummary {
  return (getNativeServices(runtime).experience?.summary?.() ?? {
    sessions: {
      ...services.sessions.summary(),
    },
    memory: {
      shared: getEffectiveMemorySnapshot(runtime, services, "memory"),
      user: getEffectiveMemorySnapshot(runtime, services, "user"),
    },
  }) as NativeExperienceSummary;
}

export function getNativeOwnershipControlPlane(
  runtime: RuntimeLike,
  services: AppServices | undefined,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): NativeOwnershipControlPlaneSummary {
  return {
    serviceResolution: getEffectiveServiceResolution(runtime),
    transportControl: getNativeTransportControlPlane(
      runtime,
      config,
      gatewayConfig,
    ),
    pluginManager: getEffectivePluginManagerInventory(runtime),
    identity: services
      ? {
          personality: getEffectivePersonalitySummary(runtime, services),
          rolodex: getEffectiveRolodexSummary(runtime, services),
          experience: getEffectiveExperienceSummary(runtime, services),
        }
      : undefined,
    ecosystem: services?.ecosystem.summary(),
  };
}

export function getEffectiveGeneratedSkills(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).agentSkills?.generated?.() ??
    services.skillSynthesis.listGeneratedSkills()
  );
}

export function getEffectivePersonalityList(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).personality?.list?.() ??
    services.personalities.list()
  );
}

export async function getNativeOwnershipSnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): Promise<NativeOwnershipSnapshot> {
  const [integration, controlPlane] = await Promise.all([
    getNativeIntegrationControlPlane(runtime, {
      web: {
        status: () => services.web.status(),
      },
      mcp: {
        status: () => services.mcp.status(),
        getCachedTools: () => services.mcp.getCachedTools(),
      },
    }),
    Promise.resolve(
      getNativeOwnershipControlPlane(runtime, services, config, gatewayConfig),
    ),
  ]);

  return {
    controlPlane,
    integration,
    autonomous: getAutonomousControlPlane(runtime, services, config),
    ui: {
      active: getTuiTheme(services.settings.get().ui.theme),
      themes: listTuiThemes(),
    },
    skillHub: services.skillsHub.summary(),
    ecosystem: services.ecosystem.summary(),
    media: getNativeMediaControlPlane(config),
    research: getNativeResearchControlPlane(runtime),
    forms: getNativeFormsControlPlane(runtime),
    planning: getNativePlanningControlPlane(runtime),
    execution: getNativeExecutionControlPlane(runtime),
  };
}

export async function getNativeEcosystemSnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
  refresh = false,
): Promise<NativeEcosystemSnapshot> {
  const [sdk, ownership] = await Promise.all([
    services.agentSdk.overview(refresh),
    services.nativeOwnership
      .snapshot(refresh)
      .then(
        (snapshot) =>
          snapshot ??
          getNativeOwnershipSnapshot(runtime, services, config, gatewayConfig),
      ),
  ]);

  return {
    runtime: {
      latest: getNativePackageAudit(config).runtime.latest,
      alpha: getNativePackageAudit(config).runtime.alpha,
    },
    accounts: getLinkedProviderAccountsSnapshot(),
    packageAudit: getNativePackageAudit(config),
    pluginCatalog: getNativePluginCatalog(config),
    sdk,
    workspace: {
      summary: services.ecosystem.summary(),
      benchmarks: services.ecosystem.benchmarkPacks(),
      channels: services.ecosystem.distributionChannels(),
      modeling: services.ecosystem.modelingProfiles(),
      optionalSkillPacks: services.ecosystem.optionalSkillPacks(),
    },
    ownership,
  };
}
