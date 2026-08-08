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
  config: EnvConfig,
): DefaultServiceModelConfig {
  const stableElizaCloudSmallModel = "xai/grok-4.1-fast-non-reasoning";
  const stableElizaCloudLargeModel = "xai/grok-4.1-fast-reasoning";
  const provider: DefaultServiceModelProvider = config.elizaCloudEnabled
    ? "elizacloud"
    : config.useLinkedDevinAuth
      ? "devin"
      : config.ollamaApiEndpoint?.trim()
        ? "ollama"
        : config.anthropicApiKey
          ? "anthropic"
          : config.openAiApiKey
            ? "openai"
            : config.useLinkedClaudeCodeAuth
              ? "claude-code"
              : config.useLinkedCodexAuth
                ? "codex"
                : "offline";
  const defaultModel =
    provider === "elizacloud"
      ? config.elizaCloudLargeModel
      : provider === "devin"
        ? config.devinModel
        : provider === "ollama"
          ? config.ollamaLargeModel
          : provider === "anthropic" || provider === "claude-code"
            ? config.anthropicLargeModel
            : config.openAiModel;
  const defaultBaseUrl =
    provider === "elizacloud"
      ? config.elizaCloudBaseUrl
      : provider === "devin"
        ? ""
        : provider === "ollama"
          ? config.ollamaApiEndpoint
          : provider === "anthropic" || provider === "claude-code"
            ? (config.anthropicBaseUrl ?? "https://api.anthropic.com")
            : provider === "codex"
              ? "https://chatgpt.com/backend-api/codex"
              : config.openAiBaseUrl;

  return {
    stableElizaCloudSmallModel,
    stableElizaCloudLargeModel,
    provider,
    defaultModel,
    defaultBaseUrl,
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
