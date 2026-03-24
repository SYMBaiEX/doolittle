import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type { PersonalityService as AgentPersonalityService } from "@/services/personality-service";

export interface PersonalityPluginOptions {
  personalities: Pick<AgentPersonalityService, "list" | "get" | "activeId"> & {
    setActive(id: string): ReturnType<AgentPersonalityService["setActive"]>;
    summary(): {
      total: number;
      activeId?: string;
      names: string[];
    };
  };
}

export function createPersonalityPlugin(
  options: PersonalityPluginOptions,
): Plugin {
  class PersonalityService extends ElizaService {
    static serviceType = "personality";
    capabilityDescription =
      "Official-style personality service backed by Eliza Agent personality profiles.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new PersonalityService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    list() {
      return options.personalities.list();
    }

    get(id: string) {
      return options.personalities.get(id);
    }

    activate(id: string) {
      return options.personalities.setActive(id);
    }

    activeId() {
      return options.personalities.activeId();
    }

    summary() {
      return options.personalities.summary();
    }
  }

  return {
    name: "personality",
    description:
      "Official-style personality plugin bridged to Eliza Agent profiles.",
    services: [PersonalityService],
  };
}

export default createPersonalityPlugin;
