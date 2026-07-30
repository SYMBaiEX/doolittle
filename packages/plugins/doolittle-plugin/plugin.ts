import { ModelType, type Plugin } from "@elizaos/core";
import { createElizaTextGenerationModelHandlers } from "@elizaos/provider-transport";
import { createDoolittlePluginSurface } from "./assembly";
import {
  createOfflineBootstrapEmbeddingModel,
  createOfflineBootstrapTextModel,
} from "./model-fallback";
import {
  createSelectedProviderTextModels,
  DOOLITTLE_MODEL_ROUTER_PRIORITY,
} from "./model-router";
import type { DoolittlePluginDependencies } from "./types";

export function createDoolittlePlugin({
  services,
  config,
}: DoolittlePluginDependencies): Plugin {
  const plugin = createDoolittlePluginSurface({ services, config });

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
