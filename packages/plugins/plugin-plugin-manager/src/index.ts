import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

export interface PluginManagerPluginOptions {
  plugins: {
    list(): unknown[];
    categories(): unknown;
  };
}

export function createPluginManagerPlugin(
  options: PluginManagerPluginOptions,
): Plugin {
  const PluginManagerService = createServiceAdapter({
    serviceType: "plugin_manager",
    capabilityDescription:
      "Official-style plugin manager service for native ElizaOS plugin inventory and categories.",
    create: async () => ({
      list() {
        return options.plugins.list();
      },
      categories() {
        return options.plugins.categories();
      },
    }),
  });

  return createServicePlugin(
    "plugin-manager",
    "Official-style plugin manager plugin for Eliza Agent's native plugin registry.",
    PluginManagerService,
  );
}

export default createPluginManagerPlugin;
