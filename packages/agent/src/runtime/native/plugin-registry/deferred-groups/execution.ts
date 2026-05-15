import type { Plugin } from "@elizaos/core";
import {
  createFormsPlugin,
  localSandboxPlugin,
} from "@plugins/doolittle-plugin";
import { normalizePlugin } from "../support";
import {
  type DeferredPluginGroupContext,
  resolveDeferredPluginDataRoot,
} from "./shared";

export async function loadDeferredExecutionPlugins({
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  return [
    normalizePlugin(localSandboxPlugin),
    createFormsPlugin({
      storage: {
        dataRoot: resolveDeferredPluginDataRoot(config),
      },
    }),
  ];
}
