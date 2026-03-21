import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

export interface PersonalityPluginOptions {
  personalities: {
    list(): unknown[];
    get(id: string): unknown;
    setActive(id: string): unknown;
    activeId(): string | undefined;
  };
}

export function createPersonalityPlugin(
  options: PersonalityPluginOptions,
): Plugin {
  const PersonalityService = createServiceAdapter({
    serviceType: "personality",
    capabilityDescription:
      "Official-style personality service backed by Eliza Agent personality profiles.",
    create: async () => ({
      list() {
        return options.personalities.list();
      },
      get(id: string) {
        return options.personalities.get(id);
      },
      activate(id: string) {
        return options.personalities.setActive(id);
      },
      activeId() {
        return options.personalities.activeId();
      },
    }),
  });

  return createServicePlugin(
    "personality",
    "Official-style personality plugin bridged to Eliza Agent profiles.",
    PersonalityService,
  );
}

export default createPersonalityPlugin;
