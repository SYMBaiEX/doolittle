import type { Plugin } from "@elizaos/core";
import { normalizePlugin } from "../support";
import {
  type DeferredPluginGroupContext,
  resolveDeferredPluginDataRoot,
} from "./shared";

export async function loadDeferredExecutionPlugins({
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const [{ e2bPlugin }, { createFormsPlugin }] = await Promise.all([
    import("@elizaos/plugin-e2b"),
    import("@elizaos/plugin-forms"),
  ]);

  return [
    normalizePlugin(e2bPlugin),
    createFormsPlugin({
      storage: {
        dataRoot: resolveDeferredPluginDataRoot(config),
      },
    }),
  ];
}
