import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
  type Service,
} from "@elizaos/core";

type GatewayTraceKind =
  | "receive"
  | "authorize"
  | "session"
  | "route"
  | "respond"
  | "deliver"
  | "update"
  | "heartbeat"
  | "reject"
  | "lifecycle";

interface GatewayHistoryFilter {
  platform?: string;
  kind?: GatewayTraceKind;
  sessionId?: string;
}

interface GatewayRuntimeStatus {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
}

interface GatewayTraceRecord {
  traceId: string;
  at: string;
  kind: GatewayTraceKind;
  platform: string;
  detail: string;
  sessionId?: string;
  userId?: string;
  roomId?: string;
  messageId?: string;
  threadId?: string;
  replyToMessageId?: string;
  deliveryId?: string;
}

interface GatewayRunner {
  runtimeStatus(): GatewayRuntimeStatus;
  trace(limit: number, filters?: GatewayHistoryFilter): GatewayTraceRecord[];
}

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
      "Official-style Discord transport service bridged into Doolittle.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new DiscordService(runtime);
    }

    async start(): Promise<void> {
      const gateway =
        this.runtime.getService<GatewayRuntimeServiceLike>("doolittle_gateway");
      await gateway?.startGateway?.();
    }

    async stop(): Promise<void> {
      return;
    }

    async status() {
      const gateway =
        this.runtime.getService<GatewayRuntimeServiceLike>("doolittle_gateway");
      return {
        enabled: options.enabled,
        tokenConfigured: options.tokenConfigured,
        gateway: (gateway?.runner?.runtimeStatus() ??
          null) as GatewayRuntimeStatus | null,
      };
    }

    history(limit = 20) {
      const gateway =
        this.runtime.getService<GatewayRuntimeServiceLike>("doolittle_gateway");
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
