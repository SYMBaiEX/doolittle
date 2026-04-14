import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import {
  getNativeMediaControlPlane,
  getNativeResearchControlPlane,
} from "@/runtime/native/service-bridge/control-planes";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { DiagnosticCheck, EnvConfig } from "@/types";
import type { AwarenessService } from "../awareness-service";
import type { RunControllerService } from "../run-controller-service";
import type { SettingsService } from "../settings-service";
import type { StartupStateService } from "../startup-state-service";
import {
  buildDiagnosticsAutonomyChecks,
  buildDiagnosticsExecutionChecks,
} from "./runtime-checks";

export function buildDiagnosticsRuntimeServiceChecks(input: {
  config: EnvConfig;
  runtime?: RuntimeLike;
  settings?: SettingsService;
  runController?: RunControllerService;
  startupState?: StartupStateService;
  awareness?: AwarenessService;
  runtimeExecutionControl?: Parameters<
    typeof buildDiagnosticsExecutionChecks
  >[0]["runtimeExecutionControl"];
  integrationControl?: Parameters<
    typeof buildDiagnosticsExecutionChecks
  >[0]["integrationControl"];
}): DiagnosticCheck[] {
  const {
    config,
    runtime,
    settings,
    runController,
    startupState,
    awareness,
    runtimeExecutionControl,
    integrationControl,
  } = input;
  const runtimeSettings = settings?.get();
  const runDepth = runtimeSettings?.agent.runDepth ?? config.runDepth;
  const maxIterations =
    runtimeSettings?.agent.maxIterations ?? config.maxIterations;
  const toolProgressMode =
    runtimeSettings?.agent.toolProgressMode ?? config.toolProgressMode;
  const autonomousAlignment = describeAutonomousAlignment(config);
  const runtimeBridgeAttached = runController?.hasRuntimeBridge() ?? false;
  const agentEventBridgeAttached =
    runController?.hasAgentEventBridge() ?? false;
  const checks = buildDiagnosticsExecutionChecks({
    config,
    runtimeExecutionControl,
    integrationControl,
    agentEventBridgeAttached,
  });

  const mediaControl = getNativeMediaControlPlane(config);
  checks.push({
    id: "media.tts.native",
    status: mediaControl.tts.ready ? "pass" : "warn",
    summary: "Native TTS ownership",
    detail: mediaControl.tts.detail,
  });

  if (runtime) {
    const researchControl = getNativeResearchControlPlane(runtime);
    const memoryStorageAvailable = Boolean(
      runtime.getService?.("memoryStorage"),
    );
    checks.push(
      {
        id: "research.action-bench.native",
        status: researchControl.actionBench.available ? "pass" : "warn",
        summary: "Action-bench plugin ownership",
        detail: researchControl.actionBench.detail,
      },
      {
        id: "research.autocoder.native",
        status: researchControl.autocoder.ready ? "pass" : "warn",
        summary: "Autocoder runtime readiness",
        detail: researchControl.autocoder.detail,
      },
      {
        id: "runtime.memory-storage",
        status: memoryStorageAvailable ? "pass" : "warn",
        summary: "Advanced memory storage bridge",
        detail: memoryStorageAvailable
          ? "memoryStorage service is registered; advanced session summaries and long-term memories can persist locally."
          : "memoryStorage service is not registered; core advanced memory will disable storage-backed summaries and long-term memory.",
      },
    );
  }

  checks.push(
    ...buildDiagnosticsAutonomyChecks({
      runDepth,
      maxIterations,
      toolProgressMode,
      runtimeBridgeAttached,
      agentEventBridgeAttached,
      awarenessInitialized: awareness?.isInitialized() ?? false,
      awarenessContributorCount: awareness?.contributorCount() ?? 0,
      startupSnapshot: startupState?.getSnapshot(),
      autonomousConnection: autonomousAlignment.connection,
    }),
  );

  return checks;
}
