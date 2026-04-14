import type { Plugin } from "@elizaos/core";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredAutomationPlugins({
  services,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const [
    { createCronPlugin },
    { createAgentSkillsPlugin },
    { createTrajectoryLoggerPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-cron"),
    import("@elizaos/plugin-agent-skills"),
    import("@elizaos/plugin-trajectory-logger"),
  ]);

  return [
    createCronPlugin({
      cron: {
        list: () => services.cron.list(),
        get: (id) => services.cron.get(id),
        create: (input) => services.cron.create(input as never),
        update: (id, patch) => services.cron.update(id, patch as never),
        runs: (limit = 20) => services.cron.runs(limit),
      },
    }),
    createAgentSkillsPlugin({
      skills: {
        list: () => services.skills.list(),
        get: (slug) => services.skills.get(slug),
        generated: () => services.skillSynthesis.listGeneratedSkills(),
        catalog: (limit) => services.skills.catalog(limit),
        searchCatalog: (query, limit) =>
          services.skills.searchCatalog(query, limit),
      },
      synthesis: {
        synthesize: async (taskId) => {
          const task = services.delegation.get(taskId);
          return services.skillSynthesis.synthesize(task);
        },
      },
    }),
    createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => services.trajectories.exportLatest(),
        listBundles: () => services.trajectories.listBundles(),
        compareLatest: () => services.trajectories.compareLatest(),
      },
    }),
  ];
}
