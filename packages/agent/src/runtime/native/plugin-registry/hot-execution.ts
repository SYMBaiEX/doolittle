import { join } from "node:path";
import type { Plugin } from "@elizaos/core";
import {
  AcpService,
  agentOrchestratorPlugin,
} from "@elizaos/plugin-agent-orchestrator";
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
import { withManagedCodingDelegation } from "../coding-delegation";
import { DesktopAdmittedAcpService } from "../desktop-admitted-acp";

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
    }),
    withManagedCodingDelegation(
      process.env.DOOLITTLE_DESKTOP_RUNTIME === "1"
        ? {
            ...agentOrchestratorPlugin,
            services: agentOrchestratorPlugin.services?.map((service) =>
              service === AcpService ? DesktopAdmittedAcpService : service,
            ),
          }
        : agentOrchestratorPlugin,
      services,
    ),
    agentSkillsPlugin,
    createPlanningPlugin({
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];
}
