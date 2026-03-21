import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

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
    summary(): {
      totalProfiles: number;
      agentName?: string;
      recentProfiles: string[];
    };
  };
}

export function createRolodexPlugin(options: RolodexPluginOptions): Plugin {
  class RolodexService extends ElizaService {
    static serviceType = "rolodex";
    capabilityDescription =
      "Official-style rolodex/profile memory service layered onto Eliza Agent profiles.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new RolodexService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    card(userId: string) {
      return options.profiles.card(userId);
    }

    remember(userId: string, kind: string, text: string, source = "rolodex") {
      return options.profiles.remember({
        userId,
        kind,
        text,
        source,
      });
    }

    recall(userId: string, query: string) {
      return options.profiles.recall(userId, query);
    }

    observeAgent(text: string, source = "rolodex") {
      return options.profiles.observeAgent({ text, source });
    }

    agentProfile() {
      return options.profiles.agentProfile();
    }

    summary() {
      return options.profiles.summary();
    }
  }

  return {
    name: "rolodex",
    description:
      "Official-style rolodex plugin for user and agent profile memory.",
    services: [RolodexService],
  };
}

export default createRolodexPlugin;
