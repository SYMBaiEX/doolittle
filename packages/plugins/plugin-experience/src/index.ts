import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

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
  const ExperienceService = createServiceAdapter({
    serviceType: "experience",
    capabilityDescription:
      "Official-style experience service backed by session summaries and memory state.",
    create: async () => ({
      usage(sessionId: string) {
        return options.sessions.usage(sessionId);
      },
      recent(limit = 5) {
        return options.sessions.latest(limit);
      },
      memorySnapshot() {
        return {
          shared: options.memory.read("memory"),
          user: options.memory.read("user"),
        };
      },
    }),
  });

  return createServicePlugin(
    "experience",
    "Official-style experience plugin powered by Eliza Agent sessions and memory.",
    ExperienceService,
  );
}

export default createExperiencePlugin;
