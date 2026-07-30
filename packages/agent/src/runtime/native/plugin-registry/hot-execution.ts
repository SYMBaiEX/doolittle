import { join } from "node:path";
import type { Plugin } from "@elizaos/core";
import { agentOrchestratorPlugin } from "@elizaos/plugin-agent-orchestrator";
import { agentSkillsPlugin } from "@elizaos/plugin-agent-skills";
import {
  createCodingAgentPlugin,
  createPlanningPlugin,
} from "@plugins/doolittle-plugin";
import type { AppServices } from "../../../services";
import {
  findLocalCodebases,
  inspectLocalProject,
  resolveLocalProjectTarget,
} from "../../../services/project-inspection";
import type { EnvConfig } from "../../../types/runtime";

export async function loadHotExecutionPlugins(
  services: AppServices,
  config: EnvConfig,
): Promise<Plugin[]> {
  return [
    createCodingAgentPlugin({
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
      findCodebases: (query, workspaceRoot) =>
        findLocalCodebases(query, workspaceRoot),
      resolveProjectTarget: (inputPath, workspaceRoot) =>
        resolveLocalProjectTarget(inputPath, workspaceRoot),
      delegation: {
        list: () => services.delegationProjection.list(),
      },
    }),
    agentOrchestratorPlugin,
    agentSkillsPlugin,
    createPlanningPlugin({
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];
}
