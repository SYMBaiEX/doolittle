import { ModelType, type Plugin } from "@elizaos/core";
import { createElizaTextGenerationModelHandlers } from "@elizaos/provider-transport";
import {
  createOfflineBootstrapEmbeddingModel,
  createOfflineBootstrapTextModel,
} from "./model-fallback";
import {
  createSelectedProviderTextModels,
  DOOLITTLE_MODEL_ROUTER_PRIORITY,
} from "./model-router";
import type { DoolittlePluginConfig } from "./types";

/**
 * Applies the plugin-owned model handlers to an application-composed surface.
 *
 * The agent owns the application actions, providers, routes, and lifecycle
 * adapters. Keeping that composition outside this package prevents this
 * vendored plugin from depending on the application that hosts it.
 */
export function createDoolittlePlugin(
  plugin: Plugin,
  config: DoolittlePluginConfig,
): Plugin {
  if (config.offlineBootstrapMode) {
    plugin.models = {
      [ModelType.TEXT_EMBEDDING]: createOfflineBootstrapEmbeddingModel(config),
      ...createElizaTextGenerationModelHandlers((runtime, params, modelType) =>
        createOfflineBootstrapTextModel(modelType)(runtime, params),
      ),
    };
  } else {
    plugin.models = createSelectedProviderTextModels();
  }
  plugin.priority = DOOLITTLE_MODEL_ROUTER_PRIORITY;

  return plugin;
}
