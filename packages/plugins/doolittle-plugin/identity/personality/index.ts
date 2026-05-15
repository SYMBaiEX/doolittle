import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type { PersonalityServiceLike } from "./types";

export interface PersonalityPluginOptions {
  personalities: Pick<PersonalityServiceLike, "list" | "get" | "activeId"> & {
    setActive(id: string): ReturnType<PersonalityServiceLike["setActive"]>;
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
      "Doolittle personality service backed by local personality profiles.";

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
    name: "@doolittle/plugin-personality",
    description: "Doolittle personality adapter bridged to local profiles.",
    services: [PersonalityService],
  };
}

export default createPersonalityPlugin;
