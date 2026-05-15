import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type {
  UserProfileBeliefSummary,
  UserProfileEngagementSummary,
  UserProfileRecallHit,
  UserProfileRelationshipSummary,
  UserProfileSearchHit,
  UserProfileServiceLike,
  UserProfileWorkspaceSummary,
} from "./types";

type RolodexRememberKind = Parameters<UserProfileServiceLike["remember"]>[1];

export interface RolodexPluginOptions {
  profiles: {
    card: UserProfileServiceLike["card"];
    remember(input: {
      userId: string;
      kind: RolodexRememberKind;
      text: string;
      source: string;
    }): ReturnType<UserProfileServiceLike["remember"]>;
    recall(userId: string, query: string): UserProfileRecallHit[];
    observeAgent(input: {
      text: string;
      source: string;
    }): ReturnType<UserProfileServiceLike["observeAgent"]>;
    agentProfile: UserProfileServiceLike["agentProfile"];
    search(query: string, limit?: number): UserProfileSearchHit[];
    beliefs(userId: string): UserProfileBeliefSummary;
    relationship(userId: string): UserProfileRelationshipSummary;
    engagement(userId: string): UserProfileEngagementSummary;
    summary(): UserProfileWorkspaceSummary;
  };
}

export function createRolodexPlugin(options: RolodexPluginOptions): Plugin {
  class RolodexService extends ElizaService {
    static serviceType = "rolodex";
    capabilityDescription =
      "Doolittle rolodex/profile memory service layered onto local profiles.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new RolodexService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    card(userId: string) {
      return options.profiles.card(userId);
    }

    remember(
      userId: string,
      kind: RolodexRememberKind,
      text: string,
      source = "rolodex",
    ) {
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

    search(query: string, limit = 10) {
      return options.profiles.search(query, limit);
    }

    beliefs(userId: string) {
      return options.profiles.beliefs(userId);
    }

    relationship(userId: string) {
      return options.profiles.relationship(userId);
    }

    engagement(userId: string) {
      return options.profiles.engagement(userId);
    }

    summary() {
      return options.profiles.summary();
    }
  }

  return {
    name: "@doolittle/plugin-rolodex",
    description: "Doolittle rolodex adapter for user and agent profile memory.",
    services: [RolodexService],
  };
}

export default createRolodexPlugin;
