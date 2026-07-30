import type { Plugin } from "@elizaos/core";
import {
  createExperiencePlugin,
  createPersonalityPlugin,
  createRolodexPlugin,
} from "@plugins/doolittle-plugin";
import type { AppServices } from "../../../services";

export async function loadHotIdentityPlugins(
  services: AppServices,
): Promise<Plugin[]> {
  return [
    createPersonalityPlugin({
      personalities: {
        list: () => services.personalities.list(),
        get: (id) => services.personalities.get(id),
        setActive: (id) => services.personalities.setActive(id),
        activeId: () => services.personalities.activeId(),
        summary: () => services.personalities.summary(),
      },
    }),
    createRolodexPlugin({
      profiles: {
        list: () => services.userProfiles.list(),
        get: (userId) => services.userProfiles.get(userId),
        card: (userId) => services.userProfiles.card(userId),
        remember: (input) =>
          services.userProfiles.remember(
            input.userId,
            input.kind as never,
            input.text,
            input.source,
          ),
        recall: (userId, query) => services.userProfiles.recall(userId, query),
        observeAgent: (input) =>
          services.userProfiles.observeAgent(input.text, input.source),
        observe: (userId, message, source, context) =>
          services.userProfiles.observe(userId, message, source, context),
        context: (userId, query) =>
          services.userProfiles.context(userId, query),
        conclude: (userId, query, conclusion, source) =>
          services.userProfiles.conclude(userId, query, conclusion, source),
        setMode: (userId, mode) => services.userProfiles.setMode(userId, mode),
        configureModeling: (userId, settings) =>
          services.userProfiles.configureModeling(userId, settings),
        seedAgent: (seed) => services.userProfiles.seedAgent(seed),
        agentProfile: () => services.userProfiles.agentProfile(),
        search: (query, limit) => services.userProfiles.search(query, limit),
        beliefs: (userId) => services.userProfiles.beliefs(userId),
        relationship: (userId) => services.userProfiles.relationship(userId),
        engagement: (userId) => services.userProfiles.engagement(userId),
        summary: () => services.userProfiles.summary(),
      },
    }),
    createExperiencePlugin({
      sessions: {
        usage: (sessionId) => services.sessions.usage(sessionId),
        latest: (limit = 5) => services.sessions.latest(limit),
        summary: () => services.sessions.summary(),
      },
      memory: {
        read: () => services.memory.read("memory"),
        summary: () => ({
          ...services.memory.summary("memory"),
          target: "memory" as const,
        }),
      },
    }),
  ];
}
