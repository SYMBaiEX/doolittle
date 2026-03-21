import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface ExperiencePluginOptions {
  sessions: {
    usage(sessionId: string): unknown;
    latest(limit?: number): unknown;
  };
  memory: {
    read(target?: "memory" | "user"): string;
  };
}

export function createExperiencePlugin(
  options: ExperiencePluginOptions,
): Plugin {
  class ExperienceService extends ElizaService {
    static serviceType = "experience";
    capabilityDescription =
      "Official-style experience service backed by session summaries and memory state.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new ExperienceService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    usage(sessionId: string) {
      return options.sessions.usage(sessionId);
    }

    recent(limit = 5) {
      return options.sessions.latest(limit);
    }

    memorySnapshot() {
      return {
        shared: options.memory.read("memory"),
        user: options.memory.read("user"),
      };
    }
  }

  return {
    name: "experience",
    description:
      "Official-style experience plugin powered by Eliza Agent sessions and memory.",
    services: [ExperienceService],
  };
}

export default createExperiencePlugin;
