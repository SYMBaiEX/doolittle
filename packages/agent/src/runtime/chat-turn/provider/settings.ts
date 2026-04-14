import type { AgentExecutionContext } from "@/runtime/chat";
import type {
  ModelSettingsSnapshot,
  ProviderModelTurnExecutionContext,
} from "./types";

export function hasModelOverride(
  before: ModelSettingsSnapshot,
  during: ModelSettingsSnapshot,
): boolean {
  return (
    during.model.provider !== before.model.provider ||
    during.model.model !== before.model.model ||
    during.model.baseUrl !== before.model.baseUrl ||
    during.model.temperature !== before.model.temperature ||
    during.model.maxTokens !== before.model.maxTokens
  );
}

export function applyModelSettings(
  context: AgentExecutionContext,
  settings: ModelSettingsSnapshot,
  executionContext: ProviderModelTurnExecutionContext,
): void {
  context.services.settings.set("model.provider", settings.model.provider);
  context.services.settings.set("model.model", settings.model.model);
  context.services.settings.set("model.baseUrl", settings.model.baseUrl);
  context.services.settings.set(
    "model.temperature",
    settings.model.temperature,
  );
  context.services.settings.set("model.maxTokens", settings.model.maxTokens);
  executionContext.syncProviderSettings(
    context,
    context.services.settings.get(),
  );
}

export function restoreRuntimeSetting(
  context: AgentExecutionContext,
  key: string,
  value: unknown,
): void {
  context.runtime.setSetting(
    key,
    typeof value === "string" || typeof value === "boolean" || value === null
      ? value
      : null,
  );
}
