import type { AppServices } from "../types";
import { activeRuns } from "./state";

export function formatRunDetail(services: AppServices): string {
  const runs = activeRuns(services);
  if (runs.length === 0) {
    return [
      "No active runs.",
      `Runtime bridge: ${services.runController.hasRuntimeBridge() ? "attached" : "missing"}`,
      `Agent-event bridge: ${services.runController.hasAgentEventBridge() ? "attached" : "missing"}`,
    ].join("\n");
  }

  return runs
    .map((run) =>
      [
        `Run ${run.runId}`,
        `  Session: ${run.sessionId}`,
        `  Status: ${run.status}`,
        `  Run depth: ${run.runDepth}`,
        `  Max iterations: ${run.configuredMaxIterations}`,
        `  Observed actions: ${run.observedActionCount}`,
        `  Pending approvals: ${run.pendingApprovals}`,
        `  Active action: ${run.activeAction ?? "—"}`,
        `  Last action: ${run.lastAction ?? "—"}`,
      ].join("\n"),
    )
    .join("\n");
}
