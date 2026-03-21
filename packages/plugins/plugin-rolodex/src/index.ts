import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

export interface RolodexPluginOptions {
  profiles: {
    card(userId: string): unknown;
    remember(input: {
      userId: string;
      kind: string;
      text: string;
      source: string;
    }): unknown;
    recall(userId: string, query: string): unknown;
    observeAgent(input: { text: string; source: string }): unknown;
    agentProfile(): unknown;
  };
}

export function createRolodexPlugin(options: RolodexPluginOptions): Plugin {
  const RolodexService = createServiceAdapter({
    serviceType: "rolodex",
    capabilityDescription:
      "Official-style rolodex/profile memory service layered onto Eliza Agent profiles.",
    create: async () => ({
      card(userId: string) {
        return options.profiles.card(userId);
      },
      remember(userId: string, kind: string, text: string, source = "rolodex") {
        return options.profiles.remember({
          userId,
          kind,
          text,
          source,
        });
      },
      recall(userId: string, query: string) {
        return options.profiles.recall(userId, query);
      },
      observeAgent(text: string, source = "rolodex") {
        return options.profiles.observeAgent({ text, source });
      },
      agentProfile() {
        return options.profiles.agentProfile();
      },
    }),
  });

  return createServicePlugin(
    "rolodex",
    "Official-style rolodex plugin for user and agent profile memory.",
    RolodexService,
  );
}

export default createRolodexPlugin;
