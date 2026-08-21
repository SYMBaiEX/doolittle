import type { Plugin } from "@elizaos/core";
import { formAction, formPlugin } from "@elizaos/plugin-form";
import { githubPlugin } from "@elizaos/plugin-github";
import mcpPlugin from "@elizaos/plugin-mcp";
import {
  createFormsPlugin,
  localSandboxPlugin,
} from "@plugins/doolittle-plugin";
import { normalizePlugin } from "../support";
import {
  type DeferredPluginGroupContext,
  resolveDeferredPluginDataRoot,
} from "./shared";

/** The upstream form plugin keeps its planner action separate by design. */
export function createNativeFormPlugin(): Plugin {
  return {
    ...formPlugin,
    actions: [...(formPlugin.actions ?? []), formAction],
  };
}

export async function loadDeferredExecutionPlugins({
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  return [
    normalizePlugin(mcpPlugin, "official MCP plugin"),
    normalizePlugin(localSandboxPlugin),
    normalizePlugin(createNativeFormPlugin(), "official form plugin"),
    createFormsPlugin({
      storage: {
        dataRoot: resolveDeferredPluginDataRoot(config),
      },
    }),
    normalizePlugin(githubPlugin, "official GitHub plugin"),
  ];
}
