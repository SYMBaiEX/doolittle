import { ModelType, type Plugin } from "@elizaos/core";
import { createElizaTextGenerationModelHandlers } from "@elizaos/provider-transport";
import { createDoolittlePluginSurface } from "./assembly";
import {
  createOfflineBootstrapEmbeddingModel,
  createOfflineBootstrapTextModel,
  OFFLINE_BOOTSTRAP_EMBEDDING_PRIORITY,
} from "./model-fallback";
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
    plugin.priority = OFFLINE_BOOTSTRAP_EMBEDDING_PRIORITY;
  }

  return plugin;
}
