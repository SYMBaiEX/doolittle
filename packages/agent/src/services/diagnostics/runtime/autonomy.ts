import type { DiagnosticCheck } from "@/types";
import type { DiagnosticsAutonomyChecksInput } from "./types";

export function buildAutonomyChecks(
  input: DiagnosticsAutonomyChecksInput,
): DiagnosticCheck[] {
  const {
    runDepth,
    maxIterations,
    toolProgressMode,
    runtimeBridgeAttached,
    agentEventBridgeAttached,
    awarenessInitialized,
    awarenessContributorCount,
    startupSnapshot,
    autonomousConnection,
  } = input;

  return [
    {
      id: "agentic.loop",
      status: runtimeBridgeAttached ? "pass" : "warn",
      summary: "Observed multi-step runtime bridge",
      detail: `multiStep=true runtimeBridge=${runtimeBridgeAttached ? "attached" : "missing"} runDepth=${runDepth} maxIterations=${maxIterations} toolProgress=${toolProgressMode}`,
    },
    {
      id: "runtime.awareness",
      status: awarenessInitialized ? "pass" : "warn",
      summary: "Native autonomous awareness registry",
      detail: awarenessInitialized
        ? `registry=initialized contributors=${awarenessContributorCount} runtimeBridge=${runtimeBridgeAttached} agentEvents=${agentEventBridgeAttached} runDepth=${runDepth} toolProgress=${toolProgressMode}`
        : "Awareness registry is not initialized; autonomous self-status injection is inactive.",
    },
    {
      id: "runtime.startup-hydration",
      status:
        startupSnapshot?.hotPathReady && startupSnapshot?.deferredReady
          ? "pass"
          : "warn",
      summary: "Startup hydration state",
      detail: startupSnapshot
        ? `hotPath=${startupSnapshot.hotPathReady ? "ready" : "warming"} runtime=${startupSnapshot.phases.runtime.status} gateway=${startupSnapshot.phases.gateway.status} cron=${startupSnapshot.phases.cron.status} diagnostics=${startupSnapshot.phases.diagnostics.status} operator=${startupSnapshot.phases.operator.status} ecosystem=${startupSnapshot.phases.ecosystem.status} skills=${startupSnapshot.phases.skills.status}`
        : "Startup hydration state is unavailable.",
    },
    {
      id: "autonomous.connection",
      status: autonomousConnection.configured ? "pass" : "warn",
      summary: "Native autonomous connection view",
      detail: `${autonomousConnection.kind} source=${autonomousConnection.source} ${autonomousConnection.detail}`,
    },
  ];
}
