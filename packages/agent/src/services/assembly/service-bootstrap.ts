import { loadGatewayConfig } from "@/config/gateway";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { EnvConfig } from "@/types";
import type {
  DefaultServiceModelConfig,
  ServiceModelContext,
} from "../bootstrap/model";
import {
  createServiceModelContextResolver,
  resolveDefaultServiceModel,
} from "../bootstrap/model";
import {
  applyServiceSettingsBootstrap,
  createServiceSettings,
} from "../bootstrap/settings";
import { LoggerService } from "../logger-service";
import type { SettingsService } from "../settings-service";
import { StartupStateService } from "../startup-state-service";

export interface ServiceBootstrapState {
  gatewayConfig: ReturnType<typeof loadGatewayConfig>;
  settings: SettingsService;
  logger: LoggerService;
  nativeOwnership: NativeOwnershipCache;
  startupState: StartupStateService;
  defaultModelConfig: ReturnType<typeof resolveDefaultServiceModel>;
  traits: DefaultServiceModelConfig;
}

export type RuntimeModelContextResolver = () => ServiceModelContext;

export function createServiceBootstrapState(
  config: EnvConfig,
): ServiceBootstrapState & {
  resolveModelContext: RuntimeModelContextResolver;
} {
  const gatewayConfig = loadGatewayConfig(config);
  const logger = new LoggerService(config.dataDir);
  const nativeOwnership = new NativeOwnershipCache(config, gatewayConfig);
  const startupState = new StartupStateService();
  const traits = resolveDefaultServiceModel(config);
  const defaultModelConfig = traits;
  const settings = createServiceSettings(config, defaultModelConfig);
  const linkedAccounts = getLinkedProviderAccountsSnapshot();
  const currentSettings = settings.get();

  applyServiceSettingsBootstrap(
    config,
    currentSettings,
    linkedAccounts,
    defaultModelConfig.stableElizaCloudSmallModel,
    defaultModelConfig.stableElizaCloudLargeModel,
    settings.set.bind(settings),
  );

  return {
    gatewayConfig,
    logger,
    nativeOwnership,
    startupState,
    settings,
    defaultModelConfig,
    traits,
    resolveModelContext: createServiceModelContextResolver(settings, config),
  };
}
