import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { EnvConfig } from "@/types";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "./types";

export interface PersistedProviderAvailability {
  persistedHasOpenAi: boolean;
  persistedHasAnthropic: boolean;
  persistedHasElizaCloud: boolean;
  persistedHasOllama: boolean;
  persistedHasCodex: boolean;
  persistedHasClaudeCode: boolean;
  persistedHasDevin: boolean;
}

function linkedAccountIsUsable(account: {
  nativeReady?: boolean;
  reusable?: boolean;
}): boolean {
  // The persisted route is explicit user intent. Desktop environment flags
  // gate automatic discovery, but must not erase a route whose linked account
  // is already native-ready or reusable.
  return Boolean(account.nativeReady || account.reusable);
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
      (Boolean(config.elizaCloudEnabled && config.elizaCloudApiKey?.trim()) ||
        linkedAccountIsUsable(linkedAccounts.elizaCloud)),
    persistedHasOllama:
      persistedProvider === "ollama" &&
      Boolean(config.ollamaApiEndpoint?.trim()),
    persistedHasCodex:
      persistedProvider === "codex" &&
      linkedAccountIsUsable(linkedAccounts.codex),
    persistedHasClaudeCode:
      persistedProvider === "claude-code" &&
      Boolean(
        (config.useLinkedClaudeCodeAuth &&
          linkedAccountIsUsable(linkedAccounts.claudeCode)) ||
          (config.claudeCodeCliFallback &&
            linkedAccounts.claudeCode.fallbackReady),
      ),
    persistedHasDevin:
      persistedProvider === "devin" &&
      linkedAccountIsUsable(linkedAccounts.devin),
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
  if (config.ollamaApiEndpoint?.trim()) {
    set("model.provider", "ollama");
    set("model.model", config.ollamaLargeModel);
    set("model.baseUrl", config.ollamaApiEndpoint);
    return;
  }
  if (linkedAccounts.devin.nativeReady || linkedAccounts.devin.reusable) {
    set("model.provider", "devin");
    set("model.model", config.devinModel);
    set("model.baseUrl", "");
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
    !availability.persistedHasElizaCloud
  ) {
    setProviderFallback(config, linkedAccounts, set);
  }

  if (
    !availability.persistedHasOpenAi &&
    !availability.persistedHasAnthropic &&
    !availability.persistedHasElizaCloud &&
    !availability.persistedHasOllama &&
    !availability.persistedHasCodex &&
    !availability.persistedHasClaudeCode &&
    !availability.persistedHasDevin
  ) {
    if (config.ollamaApiEndpoint?.trim()) {
      set("model.provider", "ollama");
      set("model.model", config.ollamaLargeModel);
      set("model.baseUrl", config.ollamaApiEndpoint);
      return;
    }
    if (config.elizaCloudEnabled && config.elizaCloudApiKey?.trim()) {
      set("model.provider", "elizacloud");
      set("model.model", config.elizaCloudLargeModel);
      set("model.baseUrl", config.elizaCloudBaseUrl);
      return;
    }
    if (linkedAccounts.devin.nativeReady || linkedAccounts.devin.reusable) {
      set("model.provider", "devin");
      set("model.model", config.devinModel);
      set("model.baseUrl", "");
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
