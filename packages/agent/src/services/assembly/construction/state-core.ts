import { AcpService } from "../../acp";
import { AgentSdkService } from "../../agent-sdk-service";
import { ApiTransportService } from "../../api-transport-service";
import { AwarenessService } from "../../awareness-service";
import { DelegationProjectionService } from "../../delegation/projection";
import { ExperienceMemoryService } from "../../experience-memory-service";
import { McpService } from "../../mcp";
import { RepositoryService } from "../../repository-service";
import { ReviewRecordService } from "../../review-record";
import { RunControllerService } from "../../run-controller-service";
import { SessionService } from "../../session/service";
import type { SettingsService } from "../../settings-service";
import type { CapabilityCatalogService } from "../../tools/service";
import { UserProfileService } from "../../user-profile/service";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceConstructionInput } from "./types";

interface DeferredToolsAccessor {
  setTools(nextTools: CapabilityCatalogService): void;
  toolsDefinitions(): ReturnType<CapabilityCatalogService["baseDefinitions"]>;
}

export interface ServiceConstructionCore {
  sessions: SessionService;
  agentSdk: AgentSdkService;
  apiTransport: ApiTransportService;
  mcp: McpService;
  acp: AcpService;
  repository: RepositoryService;
  reviewRecords: ReviewRecordService;
  runController: RunControllerService;
  awareness: AwarenessService;
  memory: ExperienceMemoryService;
  userProfiles: UserProfileService;
  delegationProjection: DelegationProjectionService;
  setTools(nextTools: CapabilityCatalogService): void;
}

export function createServiceConstructionCore(params: {
  config: ServiceConstructionInput["config"];
  directories: ServiceDirectoryLayout;
  settings: SettingsService;
}): ServiceConstructionCore {
  const { config, directories, settings } = params;
  const tools = createDeferredToolsAccessor();
  const sessions = new SessionService(config.dataDir);
  const userProfiles = new UserProfileService(directories.profilesDir);

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
      (sessionId, limit) => sessions.messagesBySession(sessionId, limit),
    ),
    repository: new RepositoryService(() => config.workspaceDir),
    reviewRecords: new ReviewRecordService(config.dataDir),
    runController: new RunControllerService(config.dataDir),
    awareness: new AwarenessService(),
    memory: new ExperienceMemoryService(
      config.dataDir,
      {
        memory: config.memoryCharLimit,
        user: config.userCharLimit,
      },
      userProfiles,
    ),
    userProfiles,
    delegationProjection: new DelegationProjectionService(),
    setTools(nextTools: CapabilityCatalogService) {
      tools.setTools(nextTools);
    },
  };
}

function createDeferredToolsAccessor(): DeferredToolsAccessor {
  let tools: CapabilityCatalogService | undefined;
  return {
    setTools(nextTools: CapabilityCatalogService) {
      tools = nextTools;
    },
    toolsDefinitions() {
      return tools ? tools.baseDefinitions() : [];
    },
  };
}
