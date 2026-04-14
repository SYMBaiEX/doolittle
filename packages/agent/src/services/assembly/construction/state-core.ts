import { AcpService } from "../../acp";
import { AgentSdkService } from "../../agent-sdk-service";
import { ApiTransportService } from "../../api-transport-service";
import { AwarenessService } from "../../awareness-service";
import { CronService } from "../../cron/service";
import { DelegationService } from "../../delegation/service";
import { McpService } from "../../mcp";
import { MemoryService } from "../../memory-service";
import { RepositoryService } from "../../repository-service";
import { RunControllerService } from "../../run-controller-service";
import { SessionService } from "../../session/service";
import type { SettingsService } from "../../settings-service";
import type { ToolsService } from "../../tools/service";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceConstructionInput } from "./types";

interface DeferredToolsAccessor {
  setTools(nextTools: ToolsService): void;
  toolsDefinitions(): ReturnType<ToolsService["baseDefinitions"]>;
}

export interface ServiceConstructionCore {
  sessions: SessionService;
  agentSdk: AgentSdkService;
  apiTransport: ApiTransportService;
  mcp: McpService;
  acp: AcpService;
  repository: RepositoryService;
  runController: RunControllerService;
  awareness: AwarenessService;
  memory: MemoryService;
  cron: CronService;
  delegation: DelegationService;
  setTools(nextTools: ToolsService): void;
}

export function createServiceConstructionCore(params: {
  config: ServiceConstructionInput["config"];
  directories: ServiceDirectoryLayout;
  settings: SettingsService;
}): ServiceConstructionCore {
  const { config, directories, settings } = params;
  const tools = createDeferredToolsAccessor();
  const sessions = new SessionService(config.dataDir);

  return {
    sessions,
    agentSdk: new AgentSdkService(),
    apiTransport: new ApiTransportService(directories.apiDir),
    mcp: new McpService(() => settings.get().mcp),
    acp: new AcpService(
      config,
      () => tools.toolsDefinitions(),
      () => sessions.summary(),
      (limit) => sessions.listSessions(limit),
    ),
    repository: new RepositoryService(config.workspaceDir),
    runController: new RunControllerService(),
    awareness: new AwarenessService(),
    memory: new MemoryService(config.dataDir, {
      memory: config.memoryCharLimit,
      user: config.userCharLimit,
    }),
    cron: new CronService(
      directories.cronDir,
      config.cronOutputDir,
      config.cronTickSeconds,
      config.timezone,
    ),
    delegation: new DelegationService(directories.delegationDir),
    setTools(nextTools: ToolsService) {
      tools.setTools(nextTools);
    },
  };
}

function createDeferredToolsAccessor(): DeferredToolsAccessor {
  let tools: ToolsService | undefined;
  return {
    setTools(nextTools: ToolsService) {
      tools = nextTools;
    },
    toolsDefinitions() {
      return tools ? tools.baseDefinitions() : [];
    },
  };
}
