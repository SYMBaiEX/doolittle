import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services";

export async function loadHotIdentityPlugins(
  services: AppServices,
): Promise<Plugin[]> {
  const [
    { createPersonalityPlugin },
    { createRolodexPlugin },
    { createExperiencePlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-personality"),
    import("@elizaos/plugin-rolodex"),
    import("@elizaos/plugin-experience"),
  ]);

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
        read: (target) => services.memory.read(target),
        summary: (target = "memory") => services.memory.summary(target),
      },
    }),
  ];
}
