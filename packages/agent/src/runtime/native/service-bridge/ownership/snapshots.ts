import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import { getTuiTheme, listTuiThemes } from "@/runtime/theme-catalog";
import type { AppServices } from "@/services";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import { getAutonomousControlPlane } from "../autonomous";
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
} from "../control-planes";
import type { RuntimeLike } from "../runtime";
import { getEffectiveExperienceSummary } from "./experience";
import {
  getEffectivePersonalitySummary,
  getEffectiveRolodexSummary,
} from "./identity";
import type {
  NativeEcosystemSnapshot,
  NativeOwnershipControlPlaneSummary,
  NativeOwnershipSnapshot,
} from "./types";

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
