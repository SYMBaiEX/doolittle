import { benchmarkConfig } from "@elizaos/plugin-action-bench";

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
      source: "native-plugin" as const,
      available: true,
      actions: benchmarkConfig.totalActionsLoaded,
      suites: {
        typewriter: benchmarkConfig.typewriterEnabled,
        multiverseMath: benchmarkConfig.multiverseMathEnabled,
        relationalData: benchmarkConfig.relationalDataEnabled,
      },
      detail: `Official action-bench plugin is loaded with ${benchmarkConfig.totalActionsLoaded} benchmark actions.`,
    },
    autocoder: {
      source: "native-plugin" as const,
      available: true,
      ready: autocoderReady,
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Generates ElizaOS projects through native autocoder services when dependencies are present.",
      methods: executionControl.codeGeneration.methods,
      dependencies: autocoderDependencies,
      detail: autocoderReady
        ? "Official autocoder runtime services are available."
        : "Official autocoder plugin is installed, but code-generation readiness still depends on e2b/forms-backed runtime services.",
    },
  };
}
