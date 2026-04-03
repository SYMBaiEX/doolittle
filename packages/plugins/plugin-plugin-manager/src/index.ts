import type {
  NativePluginCategory,
  NativePluginDescriptor,
} from "@doolittle/contracts";
import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface PluginManagerSummary {
  total: number;
  enabled: number;
  official: number;
  vendored: number;
  providers: number;
  adapters: number;
  experimental: number;
  placeholders: number;
  injectedPersistence: number;
  categories: number;
}

export type PluginManagerCategoryMap = Record<
  NativePluginCategory | string,
  Array<string | NativePluginDescriptor>
>;

export interface PluginManagerPluginOptions {
  plugins: {
    list(): NativePluginDescriptor[];
    categories(): PluginManagerCategoryMap;
    summary(): PluginManagerSummary;
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
    description: "Plugin manager plugin for Doolittle's native registry.",
    services: [PluginManagerService],
  };
}

export default createPluginManagerPlugin;
