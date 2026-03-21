import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface ExperiencePluginOptions {
  sessions: {
    usage(sessionId: string): unknown;
    latest(limit?: number): unknown;
    summary(): {
      totalSessions: number;
      recentSessionIds: string[];
    };
  };
  memory: {
    read(target?: "memory" | "user"): string;
    summary(target?: "memory" | "user"): {
      target: "memory" | "user";
      entries: number;
      characters: number;
      preview: string[];
    };
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

    summary() {
      return {
        sessions: options.sessions.summary(),
        memory: {
          shared: options.memory.summary("memory"),
          user: options.memory.summary("user"),
        },
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
