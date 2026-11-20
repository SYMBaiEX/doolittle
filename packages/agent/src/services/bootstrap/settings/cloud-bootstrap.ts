import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import type { EnvConfig } from "../../../types/index";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "./types";

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

export function applyProviderBootstrapFallbacks(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  set: SettingsSetter,
): void {
  // An unavailable account is a repairable authentication problem, not consent
  // to change provider, cost, privacy boundary, or the user's selected model.
  if (
    currentSettings.model.provider !== "offline" ||
    config.offlineBootstrapMode
  )
    return;

  set("model.provider", DEFAULT_MODEL_ROUTE.provider);
  set("model.model", DEFAULT_MODEL_ROUTE.model);
  set("model.baseUrl", DEFAULT_MODEL_ROUTE.baseUrl);
  set("model.reasoningEffort", DEFAULT_MODEL_ROUTE.reasoningEffort);
}
