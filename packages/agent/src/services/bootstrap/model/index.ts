import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import type { EnvConfig } from "@/types";
import type { SettingsService } from "../../settings-service";

export type DefaultServiceModelProvider =
  | "anthropic"
  | "openai"
  | "elizacloud"
  | "ollama"
  | "codex"
  | "claude-code"
  | "devin"
  | "offline";

export interface DefaultServiceModelConfig {
  stableElizaCloudSmallModel: string;
  stableElizaCloudLargeModel: string;
  provider: DefaultServiceModelProvider;
  defaultModel: string;
  defaultBaseUrl: string;
  defaultReasoningEffort?: "medium";
}

export interface ServiceModelContext {
  provider: "openai" | "anthropic" | "ollama" | "offline";
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  anthropicBaseUrl: string | undefined;
}

export function resolveDefaultServiceModel(
  _config: EnvConfig,
): DefaultServiceModelConfig {
  const stableElizaCloudSmallModel = "xai/grok-4.1-fast-non-reasoning";
  const stableElizaCloudLargeModel = "xai/grok-4.1-fast-reasoning";
  // Provider availability and optional local endpoints are not route choices.
  // SettingsService retains persisted selections; fresh profiles start on Codex.
  return {
    stableElizaCloudSmallModel,
    stableElizaCloudLargeModel,
    provider: DEFAULT_MODEL_ROUTE.provider,
    defaultModel: DEFAULT_MODEL_ROUTE.model,
    defaultBaseUrl: DEFAULT_MODEL_ROUTE.baseUrl,
    defaultReasoningEffort: DEFAULT_MODEL_ROUTE.reasoningEffort,
  };
}

export function createServiceModelContextResolver(
  settings: SettingsService,
  config: EnvConfig,
): () => ServiceModelContext {
  return () => ({
    provider:
      settings.get().model.provider === "codex" ||
      settings.get().model.provider === "elizacloud"
        ? "openai"
        : settings.get().model.provider === "ollama"
          ? "ollama"
          : settings.get().model.provider === "claude-code"
            ? "anthropic"
            : settings.get().model.provider === "devin"
              ? "offline"
              : (settings.get().model.provider as
                  | "openai"
                  | "anthropic"
                  | "ollama"
                  | "offline"),
    model: settings.get().model.model,
    baseUrl: settings.get().model.baseUrl,
    temperature: settings.get().model.temperature,
    maxTokens: settings.get().model.maxTokens,
    openAiApiKey: config.openAiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    anthropicBaseUrl: config.anthropicBaseUrl,
  });
}
