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
import { UserProfileService } from "../../user-profile/service";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceConstructionInput } from "./types";

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
}

export function createServiceConstructionCore(params: {
  config: ServiceConstructionInput["config"];
  directories: ServiceDirectoryLayout;
  settings: SettingsService;
}): ServiceConstructionCore {
  const { config, directories, settings } = params;
  const sessions = new SessionService(config.dataDir);
  const userProfiles = new UserProfileService(directories.profilesDir);

  return {
    sessions,
    agentSdk: new AgentSdkService(config.extensionAllowlist ?? []),
    apiTransport: new ApiTransportService(directories.apiDir),
    mcp: new McpService(() => settings.get().mcp),
    acp: new AcpService(
      config,
      () => sessions.summary(),
      (limit) => sessions.listSessions(limit),
      (sessionId, limit, offset) =>
        sessions.messagesBySession(sessionId, limit, offset),
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
  };
}
