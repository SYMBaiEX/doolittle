import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

export interface DiscordPluginOptions {
  enabled: boolean;
  tokenConfigured: boolean;
}

export function createDiscordPlugin(options: DiscordPluginOptions): Plugin {
  const DiscordService = createServiceAdapter({
    serviceType: "discord_transport",
    capabilityDescription:
      "Official-style Discord transport service bridged into Eliza Agent.",
    create: async (runtime) => ({
      async start() {
        const gateway = runtime.getService("eliza_agent_gateway") as {
          startGateway?: () => Promise<void>;
        } | null;
        await gateway?.startGateway?.();
      },
      async status() {
        const gateway = runtime.getService("eliza_agent_gateway") as {
          runner?: {
            runtimeStatus(): unknown;
          };
        } | null;
        return {
          enabled: options.enabled,
          tokenConfigured: options.tokenConfigured,
          gateway: gateway?.runner?.runtimeStatus() ?? null,
        };
      },
      history(limit = 20) {
        const gateway = runtime.getService("eliza_agent_gateway") as {
          runner?: {
            trace(limit?: number, filters?: { platform?: string }): unknown[];
          };
        } | null;
        return gateway?.runner?.trace(limit, { platform: "discord" }) ?? [];
      },
    }),
  });

  return createServicePlugin(
    "discord",
    "Official-style Discord runtime plugin aligned to the ElizaOS service model.",
    DiscordService,
  );
}

export default createDiscordPlugin;
