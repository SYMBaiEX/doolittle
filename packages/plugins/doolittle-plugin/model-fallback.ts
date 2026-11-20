import {
  getRuntimeModelSettings,
  probeOllamaModel,
} from "@doolittle/provider-transport";
import {
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  type TextEmbeddingParams,
  type TextGenerationModelType,
} from "@elizaos/core";
import { resolveSelectedModelProviderPlugin } from "./model-router";

import type { DoolittlePluginConfig } from "./types";

const DEFAULT_OFFLINE_EMBEDDING_DIMENSIONS = 768;

async function selectedOllamaIsReachable(
  runtime: IAgentRuntime,
): Promise<boolean> {
  const settings = getRuntimeModelSettings(runtime);
  if (settings.provider?.trim() !== "ollama") return true;
  const result = await probeOllamaModel(
    settings.baseUrl?.trim() ?? "",
    settings.model?.trim() ?? "",
    runtime.fetch ?? fetch,
  );
  // The opt-in offline route allows the provider to decide if a reachable
  // proxy answers the catalog request without inventory metadata.
  return result.state === "ready" || result.state === "missing_catalog";
}

/**
 * Keeps desktop chat responsive during explicit offline bootstrap. The
 * selected provider remains the source of truth whenever it can answer.
 */
export function createOfflineBootstrapTextModel(
  modelType: TextGenerationModelType,
) {
  return async (
    runtime: IAgentRuntime,
    params: GenerateTextParams,
  ): Promise<string> => {
    const selectedProvider = getRuntimeModelSettings(runtime).provider?.trim();
    const provider = resolveSelectedModelProviderPlugin(
      selectedProvider,
      runtime.getSetting("ANTHROPIC_AUTH_MODE"),
    );

    if (provider && (await selectedOllamaIsReachable(runtime))) {
      try {
        return await runtime.useModel(modelType, params, provider);
      } catch {
        // Offline bootstrap deliberately converts provider reachability into a
        // usable local response instead of letting the chat request hang or
        // exposing provider error details.
      }
    }

    return [
      "Doolittle's local runtime is ready, but its model provider is unavailable.",
      selectedProvider
        ? `Reconnect ${selectedProvider} or choose another provider in Settings to continue.`
        : "Choose a model provider in Settings to continue.",
    ].join("\n");
  };
}

function embeddingText(params: TextEmbeddingParams | string | null): string {
  if (typeof params === "string") {
    return params;
  }

  return params?.text ?? "";
}

function embeddingDimensions(config: DoolittlePluginConfig): number {
  const configured = config.elizaCloudEmbeddingDimensions;
  return typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured > 0
    ? Math.floor(configured)
    : DEFAULT_OFFLINE_EMBEDDING_DIMENSIONS;
}

function hashEmbeddingText(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Generates a deterministic local embedding solely for keeping an explicitly
 * offline runtime bootable. It is not a semantic replacement for a provider.
 */
function createDeterministicOfflineEmbedding(
  params: TextEmbeddingParams | string | null,
  config: DoolittlePluginConfig,
): number[] {
  const dimensions = embeddingDimensions(config);
  const vector = new Array<number>(dimensions);
  let state = hashEmbeddingText(embeddingText(params)) || 1;
  let squaredMagnitude = 0;

  for (let index = 0; index < dimensions; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const value = state / 0x80000000 - 1;
    vector[index] = value;
    squaredMagnitude += value * value;
  }

  const magnitude = Math.sqrt(squaredMagnitude);
  return vector.map((value) => value / magnitude);
}

/**
 * Routes to the selected provider through the public SDK API, falling back only
 * during explicit offline bootstrap if that provider is absent or unreachable.
 */
export function createOfflineBootstrapEmbeddingModel(
  config: DoolittlePluginConfig,
) {
  return async (
    runtime: IAgentRuntime,
    params: TextEmbeddingParams | string | null,
  ): Promise<number[]> => {
    const provider = resolveSelectedModelProviderPlugin(
      getRuntimeModelSettings(runtime).provider,
      runtime.getSetting("ANTHROPIC_AUTH_MODE"),
    );
    if (provider) {
      try {
        return await runtime.useModel(
          ModelType.TEXT_EMBEDDING,
          typeof params === "string" || params === null
            ? { text: embeddingText(params) }
            : params,
          provider,
        );
      } catch {
        // Offline bootstrap deliberately suppresses provider failures here so
        // runtime initialization can bind its local API without leaking error
        // details or credentials.
      }
    }

    return createDeterministicOfflineEmbedding(params, config);
  };
}
