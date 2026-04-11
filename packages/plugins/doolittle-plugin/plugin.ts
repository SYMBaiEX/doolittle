import { ModelType, type Plugin } from "@elizaos/core";
import { createDoolittlePluginSurface } from "./assembly";
import {
  createOpenAiBackedTextModel,
  hasConfiguredModelProvider,
} from "./model-fallback";
import type { DoolittlePluginDependencies } from "./types";

export function createDoolittlePlugin({
  services,
  config,
}: DoolittlePluginDependencies): Plugin {
  const plugin = createDoolittlePluginSurface({ services, config });

  if (config.offlineBootstrapMode && !hasConfiguredModelProvider(config)) {
    const textModel = createOpenAiBackedTextModel(config);
    plugin.models = {
      [ModelType.TEXT_SMALL]: textModel,
      [ModelType.TEXT_LARGE]: textModel,
    };
  }

  return plugin;
}
