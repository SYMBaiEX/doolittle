import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface DiscordPluginOptions {
  enabled: boolean;
  tokenConfigured: boolean;
}

export function createDiscordPlugin(options: DiscordPluginOptions): Plugin {
  class DiscordService extends ElizaService {
    static serviceType = "discord_transport";
    capabilityDescription =
      "Official-style Discord transport service bridged into Eliza Agent.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new DiscordService(runtime);
    }

    async start(): Promise<void> {
      const gateway = this.runtime.getService("eliza_agent_gateway") as {
        startGateway?: () => Promise<void>;
      } | null;
      await gateway?.startGateway?.();
    }

    async stop(): Promise<void> {
      return;
    }

    async status() {
      const gateway = this.runtime.getService("eliza_agent_gateway") as {
        runner?: {
          runtimeStatus(): unknown;
        };
      } | null;
      return {
        enabled: options.enabled,
        tokenConfigured: options.tokenConfigured,
        gateway: gateway?.runner?.runtimeStatus() ?? null,
      };
    }

    history(limit = 20) {
      const gateway = this.runtime.getService("eliza_agent_gateway") as {
        runner?: {
          trace(limit?: number, filters?: { platform?: string }): unknown[];
        };
      } | null;
      return gateway?.runner?.trace(limit, { platform: "discord" }) ?? [];
    }
  }

  return {
    name: "discord",
    description:
      "Official-style Discord runtime plugin aligned to the ElizaOS service model.",
    services: [DiscordService],
  };
}

export default createDiscordPlugin;
