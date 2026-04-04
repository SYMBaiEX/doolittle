import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type {
  MemoryServiceLike,
  MemorySummary,
  SessionServiceLike,
  SessionUsageSummary,
} from "./types";

export interface ExperiencePluginOptions {
  sessions: Pick<SessionServiceLike, "usage" | "latest"> & {
    usage(sessionId: string): SessionUsageSummary;
    latest(limit?: number): ReturnType<SessionServiceLike["latest"]>;
    summary(): {
      totalSessions: number;
      recentSessionIds: string[];
    };
  };
  memory: Pick<MemoryServiceLike, "read" | "summary"> & {
    read(target?: "memory" | "user"): string;
    summary(target?: "memory" | "user"): MemorySummary;
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
      "Official-style experience plugin powered by Doolittle sessions and memory.",
    services: [ExperienceService],
  };
}

export default createExperiencePlugin;
