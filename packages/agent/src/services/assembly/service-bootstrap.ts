import { loadGatewayConfig } from "@/config/gateway";
import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderName,
} from "@/runtime/native/account-auth";
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
import { resolvePersistedProviderAvailability } from "../bootstrap/settings/cloud-bootstrap";
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

function linkedProviderName(provider: string): LinkedProviderName | undefined {
  if (
    provider === "codex" ||
    provider === "claude-code" ||
    provider === "devin" ||
    provider === "elizacloud"
  ) {
    return provider;
  }
  return undefined;
}

function persistedProviderIsAvailable(
  availability: ReturnType<typeof resolvePersistedProviderAvailability>,
): boolean {
  return Object.values(availability).some(Boolean);
}

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
  const currentSettings = settings.get();
  const activeLinkedProvider = linkedProviderName(
    currentSettings.model.provider,
  );
  const activeAccounts = getLinkedProviderAccountsSnapshot(
    undefined,
    activeLinkedProvider ? [activeLinkedProvider] : [],
  );
  const activeProviderAvailable = persistedProviderIsAvailable(
    resolvePersistedProviderAvailability(
      config,
      currentSettings,
      activeAccounts,
    ),
  );
  // Full linked-account discovery can invoke multiple provider CLIs. Preserve
  // the existing fallback order when the selected route is unavailable, but
  // keep unrelated account probes out of the healthy startup path.
  const linkedAccounts = activeProviderAvailable
    ? activeAccounts
    : getLinkedProviderAccountsSnapshot();

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
