import type { getTuiTheme, listTuiThemes } from "@/runtime/theme-catalog";
import type { AppServices } from "@/services";
import type { MemorySummary } from "@/services/memory-service";
import type { UserProfileWorkspaceSummary } from "@/types/user-profile";
import type { AutonomousControlPlaneSummary } from "../autonomous";
import type {
  getEffectivePluginManagerInventory,
  getEffectiveServiceResolution,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeMediaControlPlane,
  getNativePlanningControlPlane,
  getNativeResearchControlPlane,
  getNativeTransportControlPlane,
  NativeIntegrationControlPlane,
} from "../control-planes";

export interface NativePersonalitySummary {
  total: number;
  activeId?: string;
  names: string[];
}

export interface NativeRolodexSummary extends UserProfileWorkspaceSummary {}

export interface NativeExperienceSummary {
  sessions: {
    totalSessions: number;
    recentSessionIds: string[];
  };
  memory: {
    shared: MemorySummary;
    user: MemorySummary;
  };
}

export interface NativeOwnershipControlPlaneSummary {
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

export interface NativeOwnershipSnapshot {
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

export interface NativeEcosystemSnapshot {
  runtime: {
    latest: string;
    alpha: string;
  };
  accounts: ReturnType<
    typeof import("@/runtime/native/account-auth").getLinkedProviderAccountsSnapshot
  >;
  packageAudit: ReturnType<
    typeof import("@/runtime/native/package-audit").getNativePackageAudit
  >;
  pluginCatalog: ReturnType<
    typeof import("@/runtime/native/plugin-catalog").getNativePluginCatalog
  >;
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
