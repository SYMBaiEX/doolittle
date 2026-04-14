import { DocumentsService } from "../../documents-service";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "../service-bootstrap";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceNativeWiring } from "../service-native";
import { createServiceConstructionCore } from "./state-core";
import { createServiceConstructionLeaves } from "./state-leaves";
import { createRuntimeBoundDocumentsState } from "./state-runtime";
import { createServiceConstructionSlots } from "./state-slots";
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
  type DocumentsRuntime = NonNullable<ServiceConstructionInput["runtime"]>;
  const { gatewayConfig, settings, nativeOwnership, startupState, logger } =
    bootstrap;
  const core = createServiceConstructionCore({
    config,
    directories,
    settings,
  });
  const slots = createServiceConstructionSlots({
    config,
    runtime,
    bootstrap,
    directories,
    native,
    core,
  });
  const runtimeBoundDocuments = createRuntimeBoundDocumentsState<
    DocumentsRuntime,
    DocumentsService
  >(
    runtime as DocumentsRuntime | undefined,
    (nextRuntime: DocumentsRuntime): DocumentsService =>
      new DocumentsService(nextRuntime, config.workspaceDir),
  );
  const leaves = createServiceConstructionLeaves({
    config,
    directories,
    bootstrap,
    core,
  });

  return {
    config,
    bootstrap,
    directories,
    native,
    sessions: core.sessions,
    agentSdk: core.agentSdk,
    apiTransport: core.apiTransport,
    mcp: core.mcp,
    acp: core.acp,
    repository: core.repository,
    runController: core.runController,
    awareness: core.awareness,
    memory: core.memory,
    cron: core.cron,
    delegation: core.delegation,
    ecosystem: slots.ecosystem,
    autocoderPipeline: slots.autocoderPipeline,
    diagnostics: slots.diagnostics,
    operator: slots.operator,
    skills: slots.skills,
    skillSynthesis: slots.skillSynthesis,
    skillsHub: slots.skillsHub,
    tools: slots.tools,
    documents: runtimeBoundDocuments.documents,
    contextFiles: leaves.contextFiles,
    media: leaves.media,
    trajectories: leaves.trajectories,
    contextCompression: leaves.contextCompression,
    fuzzyPatch: leaves.fuzzyPatch,
    createDocumentsService: runtimeBoundDocuments.createDocumentsService,
    setBoundRuntime(
      nextRuntime: NonNullable<ServiceConstructionInput["runtime"]>,
    ) {
      runtimeBoundDocuments.setBoundRuntime(nextRuntime);
    },
    logger,
    gatewayConfig,
    nativeOwnership,
    settings,
    startupState,
    delivery: leaves.delivery,
    gatewaySessions: leaves.gatewaySessions,
    executionApprovals: leaves.executionApprovals,
    pairing: leaves.pairing,
    hooks: leaves.hooks,
    personalities: leaves.personalities,
    workspace: leaves.workspace,
    terminal: leaves.terminal,
    web: leaves.web,
    userProfiles: leaves.userProfiles,
  };
}
