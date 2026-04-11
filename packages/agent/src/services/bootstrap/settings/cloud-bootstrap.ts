import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { EnvConfig } from "@/types";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "./types";

export interface PersistedProviderAvailability {
  persistedHasOpenAi: boolean;
  persistedHasAnthropic: boolean;
  persistedHasElizaCloud: boolean;
  persistedHasCodex: boolean;
  persistedHasClaudeCode: boolean;
}

export function resolvePersistedProviderAvailability(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  linkedAccounts: LinkedProviderAccountsSnapshot,
): PersistedProviderAvailability {
  const persistedProvider = currentSettings.model.provider;
  return {
    persistedHasOpenAi:
      persistedProvider === "openai" && Boolean(config.openAiApiKey?.trim()),
    persistedHasAnthropic:
      persistedProvider === "anthropic" &&
      Boolean(config.anthropicApiKey?.trim()),
    persistedHasElizaCloud:
      persistedProvider === "elizacloud" &&
      config.elizaCloudEnabled &&
      Boolean(config.elizaCloudApiKey?.trim()),
    persistedHasCodex:
      persistedProvider === "codex" &&
      Boolean(
        linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable,
      ),
    persistedHasClaudeCode:
      persistedProvider === "claude-code" &&
      Boolean(
        linkedAccounts.claudeCode.nativeReady ||
          linkedAccounts.claudeCode.reusable,
      ),
  };
}

export function cloudModelLooksStale(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized === "openai/gpt-5" ||
    normalized === "openai/gpt-5-mini" ||
    normalized === "anthropic/claude-sonnet-4.5" ||
    normalized === "anthropic/claude-sonnet-4.6" ||
    normalized === "xai/grok-4-fast-reasoning" ||
    normalized === "xai/grok-4.1-fast-reasoning-beta" ||
    normalized === "xai/grok-4.20-multi-agent" ||
    normalized === "xai/grok-4.20-multi-agent-beta"
  );
}

export function cloudSmallModelLooksStale(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized === "openai/gpt-5-mini" ||
    normalized === "anthropic/claude-haiku-4-5-20251001" ||
    normalized === "xai/grok-4-fast-reasoning" ||
    normalized === "xai/grok-4.1-fast-reasoning" ||
    normalized === "xai/grok-4.1-fast-reasoning-beta" ||
    normalized === "xai/grok-4.1-fast-non-reasoning-beta"
  );
}

export function reconcileElizaCloudBootstrap(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  stableElizaCloudSmallModel: string,
  stableElizaCloudLargeModel: string,
  set: SettingsSetter,
): void {
  if (!(config.elizaCloudEnabled && config.elizaCloudApiKey?.trim())) {
    return;
  }

  const desiredCloudSmallModel = cloudSmallModelLooksStale(
    config.elizaCloudSmallModel,
  )
    ? stableElizaCloudSmallModel
    : config.elizaCloudSmallModel;
  const desiredCloudModel = cloudModelLooksStale(config.elizaCloudLargeModel)
    ? stableElizaCloudLargeModel
    : config.elizaCloudLargeModel;
  const currentCloudModelNormalized = currentSettings.model.model
    .trim()
    .toLowerCase();
  const currentCloudModelIsSmallDefault =
    currentCloudModelNormalized ===
    config.elizaCloudSmallModel.trim().toLowerCase();
  const targetCloudModel = cloudModelLooksStale(currentSettings.model.model)
    ? desiredCloudModel
    : currentCloudModelIsSmallDefault
      ? desiredCloudModel
      : currentSettings.model.provider === "elizacloud"
        ? currentSettings.model.model
        : desiredCloudModel;

  if (
    currentSettings.model.provider === "elizacloud" &&
    (currentSettings.model.model !== targetCloudModel ||
      currentSettings.model.baseUrl !== config.elizaCloudBaseUrl)
  ) {
    set("model.model", targetCloudModel);
    set("model.baseUrl", config.elizaCloudBaseUrl);
  }

  if (config.elizaCloudSmallModel !== desiredCloudSmallModel) {
    config.elizaCloudSmallModel = desiredCloudSmallModel;
  }
  if (config.elizaCloudLargeModel !== desiredCloudModel) {
    config.elizaCloudLargeModel = desiredCloudModel;
  }
}

function setProviderFallback(
  config: EnvConfig,
  linkedAccounts: LinkedProviderAccountsSnapshot,
  set: SettingsSetter,
): void {
  if (linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable) {
    set("model.provider", "codex");
    set("model.model", "gpt-5.4");
    set("model.baseUrl", "https://chatgpt.com/backend-api/codex");
    return;
  }
  if (
    linkedAccounts.claudeCode.nativeReady ||
    linkedAccounts.claudeCode.reusable
  ) {
    set("model.provider", "claude-code");
    set("model.model", config.anthropicLargeModel);
    set("model.baseUrl", config.anthropicBaseUrl ?? "");
    return;
  }
  if (config.openAiApiKey?.trim()) {
    set("model.provider", "openai");
    set("model.model", config.openAiModel);
    set("model.baseUrl", config.openAiBaseUrl);
    return;
  }
  if (config.anthropicApiKey?.trim()) {
    set("model.provider", "anthropic");
    set("model.model", config.anthropicLargeModel);
    set("model.baseUrl", config.anthropicBaseUrl ?? "");
  }
}

export function applyProviderBootstrapFallbacks(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  linkedAccounts: LinkedProviderAccountsSnapshot,
  availability: PersistedProviderAvailability,
  set: SettingsSetter,
): void {
  const persistedProvider = currentSettings.model.provider;

  if (
    persistedProvider === "elizacloud" &&
    (!config.elizaCloudEnabled || !config.elizaCloudApiKey?.trim())
  ) {
    setProviderFallback(config, linkedAccounts, set);
  }

  if (
    !availability.persistedHasOpenAi &&
    !availability.persistedHasAnthropic &&
    !availability.persistedHasElizaCloud &&
    !availability.persistedHasCodex &&
    !availability.persistedHasClaudeCode
  ) {
    if (config.elizaCloudEnabled && config.elizaCloudApiKey?.trim()) {
      set("model.provider", "elizacloud");
      set("model.model", config.elizaCloudLargeModel);
      set("model.baseUrl", config.elizaCloudBaseUrl);
      return;
    }
    if (linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable) {
      set("model.provider", "codex");
      set("model.model", "gpt-5.4");
      set("model.baseUrl", "https://chatgpt.com/backend-api/codex");
      return;
    }
    if (
      linkedAccounts.claudeCode.nativeReady ||
      linkedAccounts.claudeCode.reusable
    ) {
      set("model.provider", "claude-code");
      set("model.model", config.anthropicLargeModel);
      set("model.baseUrl", config.anthropicBaseUrl ?? "");
    }
  }
}
