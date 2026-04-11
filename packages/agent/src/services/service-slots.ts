import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";
import type { AutocoderPipelineService } from "./autocoder-pipeline/service";
import type { AwarenessService } from "./awareness-service";
import { DiagnosticsService } from "./diagnostics/service";
import { EcosystemService } from "./ecosystem-service";
import { createLazySlot, type LazySlot } from "./lazy-slot";
import { OperatorService } from "./operator/service";
import type { RepositoryService } from "./repository-service";
import type { RunControllerService } from "./run-controller-service";
import type { SettingsService } from "./settings-service";
import { SkillsService } from "./skills/service";
import type { StartupStateService } from "./startup-state-service";

export function createEcosystemServiceSlot(
  startupState: StartupStateService,
): LazySlot<EcosystemService> {
  return createLazySlot(() => {
    startupState.markWarming("ecosystem", "loading ecosystem inventory");
    try {
      const service = new EcosystemService();
      startupState.markReady("ecosystem", "ecosystem inventory ready");
      return service;
    } catch (error) {
      startupState.markError(
        "ecosystem",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
}

export function createDiagnosticsServiceSlot(params: {
  config: EnvConfig;
  gatewayConfig: ReturnType<
    typeof import("@/config/gateway").loadGatewayConfig
  >;
  agentSdk: AgentSdkService;
  nativeOwnership: NativeOwnershipCache;
  ecosystem: LazySlot<EcosystemService>;
  settings: SettingsService;
  runController: RunControllerService;
  startupState: StartupStateService;
  awareness: AwarenessService;
  runtime?: ConstructorParameters<
    typeof import("./documents-service").DocumentsService
  >[0];
}): LazySlot<DiagnosticsService> {
  const {
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
  } = params;

  return createLazySlot(() => {
    startupState.markWarming("diagnostics", "building operator diagnostics");
    try {
      const service = new DiagnosticsService(
        config,
        gatewayConfig,
        agentSdk,
        nativeOwnership,
        ecosystem.get(),
        settings,
        runController,
        startupState,
        awareness,
      );
      if (runtime) {
        service.attachRuntime(runtime);
      }
      startupState.markReady("diagnostics", "operator diagnostics ready");
      return service;
    } catch (error) {
      startupState.markError(
        "diagnostics",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
}

export function createOperatorServiceSlot(params: {
  config: EnvConfig;
  diagnostics: LazySlot<DiagnosticsService>;
  repository: RepositoryService;
  autocoderPipeline: LazySlot<AutocoderPipelineService>;
  agentSdk: AgentSdkService;
  nativeOwnership: NativeOwnershipCache;
  ecosystem: LazySlot<EcosystemService>;
  startupState: StartupStateService;
  runtime?:
    | { attachRuntime(nextRuntime: NonNullable<unknown>): void }
    | undefined;
}): LazySlot<OperatorService> {
  const {
    config,
    diagnostics,
    repository,
    autocoderPipeline,
    agentSdk,
    nativeOwnership,
    ecosystem,
    startupState,
    runtime,
  } = params;

  return createLazySlot(() => {
    startupState.markWarming("operator", "building operator summaries");
    try {
      const service = new OperatorService(
        config,
        diagnostics.get(),
        repository,
        autocoderPipeline.get(),
        agentSdk,
        nativeOwnership,
        ecosystem.get(),
      );
      if (runtime) {
        service.attachRuntime(runtime as never);
      }
      startupState.markReady("operator", "operator summaries ready");
      return service;
    } catch (error) {
      startupState.markError(
        "operator",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
}

export function createSkillsServiceSlot(params: {
  config: EnvConfig;
  agentSdk: AgentSdkService;
  startupState: StartupStateService;
}): LazySlot<SkillsService> {
  const { config, agentSdk, startupState } = params;
  return createLazySlot(() => {
    startupState.markWarming("skills", "loading workspace and bundled skills");
    try {
      const service = new SkillsService(
        config.skillsDir,
        agentSdk,
        config.workspaceDir,
      );
      startupState.markReady("skills", "skills catalog ready");
      return service;
    } catch (error) {
      startupState.markError(
        "skills",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
}
