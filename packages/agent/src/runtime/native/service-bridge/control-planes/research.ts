import { benchmarkConfig } from "@plugins/doolittle-plugin";

import { getNativeServices } from "../runtime";
import { getNativeExecutionControlPlane } from "./execution";
import type { NativeResearchServices, RuntimeLike } from "./types";

export function getNativeResearchControlPlane(runtime: RuntimeLike) {
  const native = getNativeServices(runtime) as NativeResearchServices;
  const executionControl = getNativeExecutionControlPlane(runtime);
  const autocoderDependencies = {
    codeGeneration: Boolean(native.codeGeneration),
    e2b: executionControl.e2b.available,
    forms: Boolean(native.forms),
    github: Boolean(native.github),
    secretsManager: Boolean(native.secretsManager),
  };
  const autocoderReady =
    autocoderDependencies.codeGeneration &&
    autocoderDependencies.e2b &&
    autocoderDependencies.forms;

  return {
    actionBench: {
      source: "product-plugin" as const,
      available: true,
      actions: benchmarkConfig.totalActionsLoaded,
      suites: {
        typewriter: benchmarkConfig.typewriterEnabled,
        multiverseMath: benchmarkConfig.multiverseMathEnabled,
        relationalData: benchmarkConfig.relationalDataEnabled,
      },
      detail: `Doolittle's action-bench plugin is loaded through the Eliza runtime with ${benchmarkConfig.totalActionsLoaded} benchmark actions.`,
    },
    autocoder: {
      source: "product-plugin" as const,
      available: true,
      ready: autocoderReady,
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Produces experimental ElizaOS project plans through Doolittle autocoder services when dependencies are present.",
      methods: executionControl.codeGeneration.methods,
      dependencies: autocoderDependencies,
      detail: autocoderReady
        ? "Doolittle autocoder planning services and their runtime dependencies are available."
        : "Doolittle's experimental autocoder plugin is installed, but planning readiness still depends on E2B and forms services.",
    },
  };
}
