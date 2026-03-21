import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface PluginManagerPluginOptions {
  plugins: {
    list(): unknown[];
    categories(): unknown;
    summary(): {
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
  };
}

export function createPluginManagerPlugin(
  options: PluginManagerPluginOptions,
): Plugin {
  class PluginManagerService extends ElizaService {
    static serviceType = "plugin_manager";
    capabilityDescription =
      "Plugin manager service for native ElizaOS plugin inventory and categories.";

    private readonly plugins = options.plugins;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new PluginManagerService(runtime);
    }

    async stop(): Promise<void> {}

    list() {
      return this.plugins.list();
    }

    categories() {
      return this.plugins.categories();
    }

    summary() {
      return this.plugins.summary();
    }
  }

  return {
    name: "plugin-manager",
    description: "Plugin manager plugin for Eliza Agent's native registry.",
    services: [PluginManagerService],
  };
}

export default createPluginManagerPlugin;
