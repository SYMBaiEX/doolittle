import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { EnvConfig } from "@/types";
import type { AcpService } from "../../acp";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { ApiTransportService } from "../../api-transport-service";
import type { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import type { AwarenessService } from "../../awareness-service";
import type { ContextCompressionService } from "../../context-compression";
import type { ContextFilesService } from "../../context-files-service";
import type { CronService } from "../../cron/service";
import type { DelegationService } from "../../delegation/service";
import type { DeliveryService } from "../../delivery-service";
import type { DocumentsService } from "../../documents-service";
import type { ExecutionApprovalService } from "../../execution-approval/service";
import type { FuzzyPatchService } from "../../fuzzy-patch";
import type { GatewaySessionService } from "../../gateway-session-service";
import type { HooksService } from "../../hooks-service";
import type { LazySlot } from "../../lazy-slot";
import type { LoggerService } from "../../logger-service";
import type { McpService } from "../../mcp";
import type { MediaService } from "../../media";
import type { MemoryService } from "../../memory-service";
import type { PairingService } from "../../pairing-service";
import type { PersonalityService } from "../../personality-service";
import type { RepositoryService } from "../../repository-service";
import type { RunControllerService } from "../../run-controller-service";
import type {
  createDiagnosticsServiceSlot,
  createEcosystemServiceSlot,
  createOperatorServiceSlot,
  createSkillsServiceSlot,
} from "../../service-slots";
import type { SessionService } from "../../session/service";
import type { SettingsService } from "../../settings-service";
import type { SkillSynthesisService } from "../../skill-synthesis/service";
import type { SkillsService } from "../../skills/service";
import type { SkillsHubService } from "../../skills-hub/service";
import type { StartupStateService } from "../../startup-state-service";
import type { TerminalService } from "../../terminal/service";
import type { ToolsService } from "../../tools/service";
import type { TrajectoryService } from "../../trajectory/service";
import type { UserProfileService } from "../../user-profile/service";
import type { WebService } from "../../web/service";
import type { WorkspaceService } from "../../workspace-service/index";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "../service-bootstrap";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceNativeWiring } from "../service-native";

export interface ServiceConstructionInput {
  config: EnvConfig;
  runtime?: ConstructorParameters<typeof DocumentsService>[0];
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  };
  directories: ServiceDirectoryLayout;
  native: ServiceNativeWiring;
}

export interface ServiceAssemblyEager {
  apiTransport: ApiTransportService;
  agentSdk: AgentSdkService;
  nativeOwnership: NativeOwnershipCache;
  memory: MemoryService;
  sessions: SessionService;
  cron: CronService;
  pairing: PairingService;
  hooks: HooksService;
  logger: LoggerService;
  gatewaySessions: GatewaySessionService;
  executionApprovals: ExecutionApprovalService;
  delivery: DeliveryService;
  gatewayConfig: ServiceBootstrapState["gatewayConfig"];
  personalities: PersonalityService;
  workspace: WorkspaceService;
  terminal: TerminalService;
  repository: RepositoryService;
  tools: ToolsService;
  mcp: McpService;
  acp: AcpService;
  delegation: DelegationService;
  web: WebService;
  userProfiles: UserProfileService;
  settings: SettingsService;
  runController: RunControllerService;
  awareness: AwarenessService;
  startupState: StartupStateService;
  nativeRegistry: ServiceNativeWiring["nativeRegistry"];
}

export interface ServiceAssemblyLazy {
  skills: LazySlot<SkillsService>;
  documents: LazySlot<DocumentsService>;
  ecosystem: ReturnType<typeof createEcosystemServiceSlot>;
  diagnostics: ReturnType<typeof createDiagnosticsServiceSlot>;
  operator: ReturnType<typeof createOperatorServiceSlot>;
  autocoderPipeline: LazySlot<AutocoderPipelineService>;
  media: LazySlot<MediaService>;
  trajectories: LazySlot<TrajectoryService>;
  skillSynthesis: LazySlot<SkillSynthesisService>;
  skillsHub: LazySlot<SkillsHubService>;
  contextFiles: LazySlot<ContextFilesService>;
  contextCompression: LazySlot<ContextCompressionService>;
  fuzzyPatch: LazySlot<FuzzyPatchService>;
}

export interface ServiceRuntimeBindingDependencies {
  executionApprovals: ExecutionApprovalService;
  documents: LazySlot<DocumentsService>;
  diagnostics: ReturnType<typeof createDiagnosticsServiceSlot>;
  operator: ReturnType<typeof createOperatorServiceSlot>;
  createDocumentsService(
    nextRuntime: ConstructorParameters<typeof DocumentsService>[0],
  ): DocumentsService;
  setBoundRuntime(
    nextRuntime: ConstructorParameters<typeof DocumentsService>[0],
  ): void;
}

export interface ServiceAssemblyResult {
  eagerServices: ServiceAssemblyEager;
  lazyServices: ServiceAssemblyLazy;
  runtimeBinding: ServiceRuntimeBindingDependencies;
}

export interface ServiceConstructionState {
  config: EnvConfig;
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  };
  directories: ServiceDirectoryLayout;
  native: ServiceNativeWiring;
  sessions: SessionService;
  agentSdk: AgentSdkService;
  apiTransport: ApiTransportService;
  mcp: McpService;
  acp: AcpService;
  repository: RepositoryService;
  runController: RunControllerService;
  awareness: AwarenessService;
  ecosystem: ReturnType<typeof createEcosystemServiceSlot>;
  autocoderPipeline: LazySlot<AutocoderPipelineService>;
  diagnostics: ReturnType<typeof createDiagnosticsServiceSlot>;
  operator: ReturnType<typeof createOperatorServiceSlot>;
  skills: ReturnType<typeof createSkillsServiceSlot>;
  skillSynthesis: LazySlot<SkillSynthesisService>;
  skillsHub: LazySlot<SkillsHubService>;
  tools: ToolsService;
  documents: LazySlot<DocumentsService>;
  contextFiles: LazySlot<ContextFilesService>;
  media: LazySlot<MediaService>;
  trajectories: LazySlot<TrajectoryService>;
  contextCompression: LazySlot<ContextCompressionService>;
  fuzzyPatch: LazySlot<FuzzyPatchService>;
  createDocumentsService(
    nextRuntime: ConstructorParameters<typeof DocumentsService>[0],
  ): DocumentsService;
  setBoundRuntime(
    nextRuntime: ConstructorParameters<typeof DocumentsService>[0],
  ): void;
  logger: LoggerService;
  gatewayConfig: ServiceBootstrapState["gatewayConfig"];
  nativeOwnership: NativeOwnershipCache;
  settings: SettingsService;
  startupState: StartupStateService;
  memory: MemoryService;
  cron: CronService;
  delegation: DelegationService;
  delivery: DeliveryService;
  gatewaySessions: GatewaySessionService;
  executionApprovals: ExecutionApprovalService;
  pairing: PairingService;
  hooks: HooksService;
  personalities: PersonalityService;
  workspace: WorkspaceService;
  terminal: TerminalService;
  web: WebService;
  userProfiles: UserProfileService;
}
