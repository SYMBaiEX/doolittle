import {
  type GenerateTextParams,
  type IAgentRuntime,
  NoModelProviderConfiguredError,
  type TextGenerationModelType,
} from "@elizaos/core";
import { createElizaTextGenerationModelHandlers } from "@elizaos/provider-transport";
import { readRuntimeModelSettings } from "./runtime-settings";

export const DOOLITTLE_MODEL_ROUTER_PRIORITY = 1_000;

const DOOLITTLE_MODEL_ROUTER_PROVIDER = "doolittle-runtime";

const PROVIDER_PLUGIN_NAMES: Readonly<Record<string, string>> = {
  anthropic: "anthropic",
  "claude-code": "@elizaos/plugin-claude-code",
  codex: "@elizaos/plugin-codex",
  devin: "@elizaos/plugin-devin",
  elizacloud: "@elizaos/plugin-elizacloud",
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
