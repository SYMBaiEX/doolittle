import { join } from "node:path";
import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services";
import { inspectLocalProject } from "../../../services/project-inspection";
import type { EnvConfig } from "../../../types/runtime";
import { normalizeDelegationInput } from "../plugin-assembly-delegation";
import { buildNativePluginManagerSummary } from "../plugin-assembly-support";
import type {
  NativePluginCatalog,
  NativePluginCatalogGroups,
} from "../plugin-catalog";

export async function loadHotExecutionPlugins(
  services: AppServices,
  config: EnvConfig,
  catalog: NativePluginCatalog,
  groupedCatalog: NativePluginCatalogGroups,
): Promise<Plugin[]> {
  const [
    { createShellPlugin },
    { createCodingAgentPlugin },
    { createAgentOrchestratorPlugin },
    { createPluginManagerPlugin },
    { createPlanningPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-shell"),
    import("@elizaos/plugin-coding-agent"),
    import("@elizaos/plugin-agent-orchestrator"),
    import("@elizaos/plugin-plugin-manager"),
    import("@elizaos/plugin-planning"),
  ]);

  return [
    createShellPlugin({
      terminal: {
        run: (command) => services.terminal.run(command),
        getHistory: (limit = 20) => services.terminal.getHistory(limit),
        status: () => services.terminal.status(),
      },
    }),
    createCodingAgentPlugin({
      workspaceRoot: services.workspace.root(),
      workspace: services.workspace,
      repository: {
        isRepository: () => services.repository.isRepository(),
        status: () => services.repository.status(),
        diffStat: () => services.repository.diffStat(),
        recentCommits: (limit = 10) => services.repository.recentCommits(limit),
      },
      shell: {
        run: (command) => services.terminal.run(command),
      },
      inspectProject: (targetPath) => inspectLocalProject(targetPath),
      delegation: {
        create: (input) =>
          services.delegation.create(normalizeDelegationInput(input)),
        list: () => services.delegation.list(),
      },
    }),
    createAgentOrchestratorPlugin({
      delegation: {
        create: (input) =>
          services.delegation.create(normalizeDelegationInput(input)),
        list: () => services.delegation.list(),
        get: (id) => services.delegation.get(id),
        queueSummary: () => services.delegation.queueSummary(),
        overview: () => services.delegation.overview(),
        getChildren: (id) => services.delegation.listChildren(id),
        tree: (id) => services.delegation.tree(id),
        spawnChild: (parentId, input) =>
          services.delegation.spawnChild(
            parentId,
            normalizeDelegationInput(input),
          ),
        retryTask: (id, note, options) =>
          services.delegation.requeue(id, note, options),
        cancel: (id, note) => services.delegation.cancel(id, note),
        supervise: (runner, options) =>
          services.delegation.supervise(runner as never, options as never),
        runQueued: (runner, options) =>
          services.delegation.runQueued(runner as never, options as never),
      },
    }),
    createPluginManagerPlugin({
      plugins: {
        list: () => catalog,
        categories: () => groupedCatalog,
        summary: () => buildNativePluginManagerSummary(catalog),
      },
    }),
    createPlanningPlugin({
      delegation: {
        list: () => services.delegation.list(),
        get: (id) => services.delegation.get(id),
      },
      workflows: {
        list: (limit = 50) => services.autocoderPipeline.listWorkflows(limit),
        get: (id) => services.autocoderPipeline.workflow(id),
      },
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];
}
