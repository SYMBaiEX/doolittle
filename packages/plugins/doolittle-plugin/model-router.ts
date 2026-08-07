import { createElizaTextGenerationModelHandlers } from "@doolittle/provider-transport";
import {
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  NoModelProviderConfiguredError,
  type ResearchParams,
  type ResearchResult,
  type TextGenerationModelType,
} from "@elizaos/core";
import { readRuntimeModelSettings } from "./runtime-settings";

export const DOOLITTLE_MODEL_ROUTER_PRIORITY = 1_000;

const DOOLITTLE_MODEL_ROUTER_PROVIDER = "doolittle-runtime";

const PROVIDER_PLUGIN_NAMES: Readonly<Record<string, string>> = {
  anthropic: "anthropic",
  "claude-code": "@doolittle/plugin-claude-code",
  codex: "codex-cli",
  devin: "@doolittle/plugin-devin",
  elizacloud: "elizaOSCloud",
  ollama: "ollama",
  openai: "openai",
};

export function resolveSelectedModelProviderPlugin(
  provider: string | undefined,
): string | undefined {
  const normalizedProvider = provider?.trim();
  if (!normalizedProvider) {
    return undefined;
  }

  return PROVIDER_PLUGIN_NAMES[normalizedProvider] ?? normalizedProvider;
}

export function createSelectedProviderTextModel(
  modelType: TextGenerationModelType,
) {
  return async (
    runtime: IAgentRuntime,
    params: GenerateTextParams,
  ): Promise<string> => {
    const provider = resolveSelectedModelProviderPlugin(
      readRuntimeModelSettings(runtime)?.provider,
    );
    if (!provider || provider === DOOLITTLE_MODEL_ROUTER_PROVIDER) {
      throw new NoModelProviderConfiguredError(
        "Doolittle has no active model provider. Choose one in Settings.",
      );
    }

    return runtime.useModel(modelType, params, provider);
  };
}

/**
 * Registers Doolittle's live provider selection through Eliza's native model
 * registry. Explicit provider dispatch prevents this default router from
 * recursively selecting itself.
 */
export function createSelectedProviderTextModels() {
  return createElizaTextGenerationModelHandlers((runtime, params, modelType) =>
    createSelectedProviderTextModel(modelType)(runtime, params),
  );
}

export function createSelectedProviderResearchModel() {
  return async (
    runtime: IAgentRuntime,
    params: ResearchParams,
  ): Promise<ResearchResult> => {
    const provider = resolveSelectedModelProviderPlugin(
      readRuntimeModelSettings(runtime)?.provider,
    );
    if (!provider || provider === DOOLITTLE_MODEL_ROUTER_PROVIDER) {
      throw new NoModelProviderConfiguredError(
        "Doolittle has no active research provider. Choose OpenAI or Eliza Cloud in Settings.",
      );
    }
    return runtime.useModel(ModelType.RESEARCH, params, provider);
  };
}

export function createSelectedProviderModels() {
  return {
    ...createSelectedProviderTextModels(),
    [ModelType.RESEARCH]: createSelectedProviderResearchModel(),
  };
}
