import type {
  ServiceAssemblyEager,
  ServiceAssemblyLazy,
  ServiceAssemblyResult,
  ServiceConstructionState,
  ServiceRuntimeBindingDependencies,
} from "./types";

export function createServiceAssemblyEagerServices(
  state: ServiceConstructionState,
): ServiceAssemblyEager {
  return {
    apiTransport: state.apiTransport,
    agentSdk: state.agentSdk,
    nativeOwnership: state.nativeOwnership,
    memory: state.memory,
    sessions: state.sessions,
    pairing: state.pairing,
    hooks: state.hooks,
    logger: state.logger,
    gatewaySessions: state.gatewaySessions,
    executionApprovals: state.executionApprovals,
    delivery: state.delivery,
    gatewayConfig: state.gatewayConfig,
    personalities: state.personalities,
    workspace: state.workspace,
    terminal: state.terminal,
    repository: state.repository,
    reviewRecords: state.reviewRecords,
    tools: state.tools,
    mcp: state.mcp,
    acp: state.acp,
    delegationProjection: state.delegationProjection,
    web: state.web,
    userProfiles: state.userProfiles,
    settings: state.settings,
    runController: state.runController,
    awareness: state.awareness,
    startupState: state.startupState,
    nativeRegistry: state.native.nativeRegistry,
  };
}

export function createServiceAssemblyLazyServices(
  state: ServiceConstructionState,
): ServiceAssemblyLazy {
  return {
    skills: state.skills,
    documents: state.documents,
    ecosystem: state.ecosystem,
    diagnostics: state.diagnostics,
    operator: state.operator,
    autocoderPipeline: state.autocoderPipeline,
    media: state.media,
    trajectoryEvaluation: state.trajectoryEvaluation,
    skillSynthesis: state.skillSynthesis,
    skillsHub: state.skillsHub,
    contextFiles: state.contextFiles,
    contextCompression: state.contextCompression,
    fuzzyPatch: state.fuzzyPatch,
  };
}

export function createServiceAssemblyRuntimeBinding(
  state: ServiceConstructionState,
): ServiceRuntimeBindingDependencies {
  return {
    executionApprovals: state.executionApprovals,
    pairing: state.pairing,
    hooks: state.hooks,
    delegationProjection: state.delegationProjection,
    documents: state.documents,
    diagnostics: state.diagnostics,
    operator: state.operator,
    skills: state.skills,
    createDocumentsService: state.createDocumentsService,
    setBoundRuntime: state.setBoundRuntime,
  };
}

export function createServiceAssemblyResult(
  state: ServiceConstructionState,
): ServiceAssemblyResult {
  return {
    eagerServices: createServiceAssemblyEagerServices(state),
    lazyServices: createServiceAssemblyLazyServices(state),
    runtimeBinding: createServiceAssemblyRuntimeBinding(state),
  };
}
