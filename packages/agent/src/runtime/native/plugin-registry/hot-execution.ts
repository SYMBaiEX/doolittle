import { join } from "node:path";
import {
  createCodingAgentPlugin,
  createPlanningPlugin,
} from "@doolittle/plugins/doolittle-plugin";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import {
  AcpService,
  agentOrchestratorPlugin,
} from "@elizaos/plugin-agent-orchestrator";
import {
  AgentSkillsService,
  agentSkillsPlugin,
} from "@elizaos/plugin-agent-skills";
import type { AppServices } from "../../../services";
import {
  findLocalCodebases,
  inspectLocalProject,
  resolveLocalProjectTarget,
} from "../../../services/project-inspection";
import type { EnvConfig } from "../../../types/runtime";
import { withManagedCodingDelegation } from "../coding-delegation";
import { DesktopAdmittedAcpService } from "../desktop-admitted-acp";

// Pass startup policy through the service's public configuration API. Catalog
// refresh is optional network work and must not delay the local client boot.
class ClientAgentSkillsService extends AgentSkillsService {
  constructor(runtime?: IAgentRuntime) {
    if (!runtime) throw new Error("Skills require an Eliza runtime.");
    super(runtime);
  }

  static override start(runtime: IAgentRuntime) {
    const sync = runtime.getSetting("SKILLS_SYNC_CATALOG_ON_START");
    return AgentSkillsService.start(runtime, {
      syncCatalogOnStart: sync === true || sync === "true",
    });
  }
}

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
    {
      ...agentSkillsPlugin,
      services: [ClientAgentSkillsService],
    },
    createPlanningPlugin({
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];
}
