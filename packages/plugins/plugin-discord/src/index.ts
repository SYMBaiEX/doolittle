import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
  type Service,
} from "@elizaos/core";
import type {
  GatewayHistoryFilter,
  GatewayRunner,
  GatewayRuntimeStatus,
  GatewayTraceRecord,
} from "@/gateway/gateway-runner";

export interface DiscordPluginOptions {
  enabled: boolean;
  tokenConfigured: boolean;
}

interface GatewayRuntimeServiceLike extends Service {
  startGateway?: () => Promise<void>;
  runner?: Pick<GatewayRunner, "runtimeStatus" | "trace">;
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
      const gateway = this.runtime.getService<GatewayRuntimeServiceLike>(
        "eliza_agent_gateway",
      );
      await gateway?.startGateway?.();
    }

    async stop(): Promise<void> {
      return;
    }

    async status() {
      const gateway = this.runtime.getService<GatewayRuntimeServiceLike>(
        "eliza_agent_gateway",
      );
      return {
        enabled: options.enabled,
        tokenConfigured: options.tokenConfigured,
        gateway: (gateway?.runner?.runtimeStatus() ??
          null) as GatewayRuntimeStatus | null,
      };
    }

    history(limit = 20) {
      const gateway = this.runtime.getService<GatewayRuntimeServiceLike>(
        "eliza_agent_gateway",
      );
      const filters: GatewayHistoryFilter = { platform: "discord" };
      return (
        (gateway?.runner?.trace(limit, filters) as GatewayTraceRecord[]) ?? []
      );
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
