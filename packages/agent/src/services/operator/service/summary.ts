import type { OperatorRuntimeSummaryDependencies } from "../runtime-summary";
import {
  buildOperatorSetupSummary,
  buildOperatorUpdatePreview,
} from "../runtime-summary";
import { getAttachedOperatorRuntime } from "./runtime";
import type {
  OperatorServiceSummaryBindings,
  SetupSummary,
  UpdatePreview,
} from "./types";

function toRuntimeSummaryDependencies(
  bindings: OperatorServiceSummaryBindings,
): OperatorRuntimeSummaryDependencies {
  return {
    config: bindings.config,
    diagnostics: bindings.diagnostics,
    repository: bindings.repository,
    version: () => bindings.versionAccess.read(bindings.config),
    autocoderPipeline: bindings.autocoderPipeline,
    agentSdk: bindings.agentSdk,
    nativeOwnership: bindings.nativeOwnership,
    ecosystemService: bindings.ecosystemService,
    runtime: getAttachedOperatorRuntime(bindings.runtimeAttachment),
  };
}

export async function buildOperatorServiceSetupSummary(
  bindings: OperatorServiceSummaryBindings,
): Promise<SetupSummary> {
  return buildOperatorSetupSummary(toRuntimeSummaryDependencies(bindings));
}

export async function buildOperatorServiceUpdatePreview(
  bindings: OperatorServiceSummaryBindings,
): Promise<UpdatePreview> {
  return buildOperatorUpdatePreview(toRuntimeSummaryDependencies(bindings));
}
