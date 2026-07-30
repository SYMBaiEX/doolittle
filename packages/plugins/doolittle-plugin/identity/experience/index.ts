import { DOOLITTLE_EXPERIENCE_SERVICE } from "@doolittle/contracts";
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
    read(target?: "memory"): string;
    summary(target?: "memory"): MemorySummary;
  };
}

export function createExperiencePlugin(
  options: ExperiencePluginOptions,
): Plugin {
  class ExperienceService extends ElizaService {
    static serviceType = DOOLITTLE_EXPERIENCE_SERVICE;
    capabilityDescription =
      "Doolittle experience service backed by session summaries and memory state.";

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
      return options.memory.read("memory");
    }

    summary() {
      return {
        sessions: options.sessions.summary(),
        memory: {
          shared: options.memory.summary("memory"),
        },
      };
    }
  }

  return {
    name: "@doolittle/plugin-experience",
    description:
      "Doolittle experience adapter powered by local sessions and memory.",
    services: [ExperienceService],
  };
}

export default createExperiencePlugin;
