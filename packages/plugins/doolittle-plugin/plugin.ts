import { ModelType, type Plugin } from "@elizaos/core";
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
      [ModelType.TEXT_NANO]: createOfflineBootstrapTextModel(
        ModelType.TEXT_NANO,
      ),
      [ModelType.TEXT_SMALL]: createOfflineBootstrapTextModel(
        ModelType.TEXT_SMALL,
      ),
      [ModelType.TEXT_MEDIUM]: createOfflineBootstrapTextModel(
        ModelType.TEXT_MEDIUM,
      ),
      [ModelType.TEXT_LARGE]: createOfflineBootstrapTextModel(
        ModelType.TEXT_LARGE,
      ),
      [ModelType.TEXT_MEGA]: createOfflineBootstrapTextModel(
        ModelType.TEXT_MEGA,
      ),
      [ModelType.RESPONSE_HANDLER]: createOfflineBootstrapTextModel(
        ModelType.RESPONSE_HANDLER,
      ),
      [ModelType.ACTION_PLANNER]: createOfflineBootstrapTextModel(
        ModelType.ACTION_PLANNER,
      ),
      [ModelType.TEXT_REASONING_SMALL]: createOfflineBootstrapTextModel(
        ModelType.TEXT_REASONING_SMALL,
      ),
      [ModelType.TEXT_REASONING_LARGE]: createOfflineBootstrapTextModel(
        ModelType.TEXT_REASONING_LARGE,
      ),
      [ModelType.TEXT_COMPLETION]: createOfflineBootstrapTextModel(
        ModelType.TEXT_COMPLETION,
      ),
    };
    plugin.priority = OFFLINE_BOOTSTRAP_EMBEDDING_PRIORITY;
  }

  return plugin;
}
