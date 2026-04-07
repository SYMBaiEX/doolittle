import { AcpService } from "../../acp";
import { AgentSdkService } from "../../agent-sdk-service";
import { ApiTransportService } from "../../api-transport-service";
import { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import { AwarenessService } from "../../awareness-service";
import { createToolsDynamicStateResolver } from "../../bootstrap/tools";
import { ContextCompressionService } from "../../context-compression";
import { ContextFilesService } from "../../context-files-service";
import { CronService } from "../../cron/service";
import { DelegationService } from "../../delegation/service";
import { DeliveryService } from "../../delivery-service";
import { DocumentsService } from "../../documents-service";
import { ExecutionApprovalService } from "../../execution-approval/service";
import { FuzzyPatchService } from "../../fuzzy-patch";
import { GatewaySessionService } from "../../gateway-session-service";
import { HooksService } from "../../hooks-service";
import { createLazySlot } from "../../lazy-slot";
import { McpService } from "../../mcp";
import { MediaService } from "../../media";
import { MemoryService } from "../../memory-service";
import { PairingService } from "../../pairing-service";
import { PersonalityService } from "../../personality-service";
import { RepositoryService } from "../../repository-service";
import { RunControllerService } from "../../run-controller-service";
import {
  createDiagnosticsServiceSlot,
  createEcosystemServiceSlot,
  createOperatorServiceSlot,
  createSkillsServiceSlot,
} from "../../service-slots";
import { SessionService } from "../../session/service";
import { SkillSynthesisService } from "../../skill-synthesis/service";
import { SkillsHubService } from "../../skills-hub/service";
import { TerminalService } from "../../terminal/service";
import { ToolsService } from "../../tools/service";
import { TrajectoryService } from "../../trajectory/service";
import { UserProfileService } from "../../user-profile/service";
import { WebService } from "../../web/service";
import { WorkspaceService } from "../../workspace-service";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "../service-bootstrap";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceNativeWiring } from "../service-native";
import type {
  ServiceConstructionInput,
  ServiceConstructionState,
} from "./types";

export function createServiceConstructionState(
  config: ServiceConstructionInput["config"],
  runtime: ServiceConstructionInput["runtime"],
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  },
  directories: ServiceDirectoryLayout,
  native: ServiceNativeWiring,
): ServiceConstructionState {
  const { gatewayConfig, settings, nativeOwnership, startupState, logger } =
    bootstrap;
  const { defaultModel } = bootstrap.defaultModelConfig;
  const getModelContext = bootstrap.resolveModelContext;
  const sessions = new SessionService(config.dataDir);
  const agentSdk = new AgentSdkService();
  const apiTransport = new ApiTransportService(directories.apiDir);
  const mcp = new McpService(() => settings.get().mcp);
  let tools: ToolsService;
  const acp = new AcpService(
    config,
    () => (tools ? tools.baseDefinitions() : []),
    () => sessions.summary(),
    (limit) => sessions.listSessions(limit),
  );
  const repository = new RepositoryService(config.workspaceDir);
  const runController = new RunControllerService();
  const awareness = new AwarenessService();
  const memory = new MemoryService(config.dataDir, {
    memory: config.memoryCharLimit,
    user: config.userCharLimit,
  });
  const cron = new CronService(
    directories.cronDir,
    config.cronOutputDir,
    config.cronTickSeconds,
    config.timezone,
  );
  const delegation = new DelegationService(directories.delegationDir);
  const ecosystem = createEcosystemServiceSlot(startupState);
  const autocoderPipeline = createLazySlot(
    () => new AutocoderPipelineService(directories.autocoderDir),
  );
  const diagnostics = createDiagnosticsServiceSlot({
    config,
    gatewayConfig,
    agentSdk,
    nativeOwnership,
    ecosystem,
    settings,
    runController,
    startupState,
    awareness,
    runtime,
  });
  const operator = createOperatorServiceSlot({
    config,
    diagnostics,
    repository,
    autocoderPipeline,
    agentSdk,
    nativeOwnership,
    ecosystem,
    startupState,
    runtime: runtime
      ? {
          attachRuntime: (nextRuntime) => {
            void nextRuntime;
          },
        }
      : undefined,
  });
  const skills = createSkillsServiceSlot({
    config,
    agentSdk,
    startupState,
  });
  const skillSynthesis = createLazySlot(
    () => new SkillSynthesisService(config.skillsDir),
  );
  const skillsHub = createLazySlot(
    () =>
      new SkillsHubService(
        skills.get(),
        skillSynthesis.get(),
        agentSdk,
        config.dataDir,
      ),
  );
  tools = new ToolsService(
    createToolsDynamicStateResolver({
      mcp,
      acp,
      nativePluginCatalog: () =>
        native.nativePluginCatalog.get().map((entry) => ({
          id: entry.id,
          category: entry.category,
          source: entry.source,
          enabled: entry.enabled,
          notes: entry.notes,
        })),
      nativePackageAudit: () => native.nativePackageAudit.get(),
      agentSdk,
      skillsHub: {
        summary: () => skillsHub.get().summary(),
      },
      ecosystem: {
        summary: () => ecosystem.get().summary(),
      },
      nativeOwnership,
    }),
  );

  let boundRuntime = runtime;
  const fallbackRuntime = {} as NonNullable<
    ServiceConstructionInput["runtime"]
  >;
  const createDocumentsService = (
    nextRuntime: NonNullable<ServiceConstructionInput["runtime"]>,
  ): DocumentsService => new DocumentsService(nextRuntime, config.workspaceDir);
  const documents = createLazySlot(() =>
    createDocumentsService(boundRuntime ?? fallbackRuntime),
  );

  const contextFiles = createLazySlot(
    () => new ContextFilesService(directories.workspaceDir),
  );
  const media = createLazySlot(
    () =>
      new MediaService(
        directories.workspaceDir,
        directories.mediaDir,
        getModelContext,
      ),
  );
  const trajectories = createLazySlot(
    () =>
      new TrajectoryService(
        directories.trajectoriesDir,
        sessions,
        getModelContext,
      ),
  );
  const contextCompression = createLazySlot(
    () =>
      new ContextCompressionService({
        contextWindowTokens:
          ContextCompressionService.resolveContextWindow(defaultModel),
        threshold: 0.85,
        preserveRecentTurns: 6,
        preserveLeadingTurns: 2,
      }),
  );
  const fuzzyPatch = createLazySlot(
    () =>
      new FuzzyPatchService({
        maxEditDistance: 4,
        contextMatchRatio: 0.6,
      }),
  );

  return {
    config,
    bootstrap,
    directories,
    native,
    sessions,
    agentSdk,
    apiTransport,
    mcp,
    acp,
    repository,
    runController,
    awareness,
    memory,
    cron,
    delegation,
    ecosystem,
    autocoderPipeline,
    diagnostics,
    operator,
    skills,
    skillSynthesis,
    skillsHub,
    tools,
    documents,
    contextFiles,
    media,
    trajectories,
    contextCompression,
    fuzzyPatch,
    createDocumentsService,
    setBoundRuntime(
      nextRuntime: NonNullable<ServiceConstructionInput["runtime"]>,
    ) {
      boundRuntime = nextRuntime;
    },
    logger,
    gatewayConfig,
    nativeOwnership,
    settings,
    startupState,
    delivery: new DeliveryService(directories.gatewayDeliveryDir),
    gatewaySessions: new GatewaySessionService(directories.gatewaySessionDir),
    executionApprovals: new ExecutionApprovalService(
      directories.gatewayApprovalDir,
    ),
    pairing: new PairingService(directories.gatewayPairingDir),
    hooks: new HooksService(directories.hooksDir),
    personalities: new PersonalityService(config.dataDir),
    workspace: new WorkspaceService(directories.workspaceDir),
    terminal: new TerminalService(
      directories.terminalDir,
      directories.workspaceDir,
      () => settings.get(),
    ),
    web: new WebService(
      () => ({
        provider: config.browserProvider,
        command: config.browserCommand,
        cdpUrl: config.browserCdpUrl,
        obeyRobots: config.browserObeyRobots,
      }),
      directories.webDir,
    ),
    userProfiles: new UserProfileService(directories.profilesDir),
  };
}
