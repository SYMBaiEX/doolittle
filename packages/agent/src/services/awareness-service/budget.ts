import type { AwarenessContributor } from "@elizaos/autonomous/contracts/awareness";
import type { AppServices } from "../types";
import { formatRunDetail } from "./run-detail";
import { activeRuns } from "./state";

function bridgeStatus(services: AppServices): "on" | "off" {
  return services.runController.hasRuntimeBridge() ? "on" : "off";
}

function formatIdleRunSummary(services: AppServices): string {
  return `run=idle bridge=${bridgeStatus(services)}`;
}

function formatActiveRunSummary(services: AppServices): string {
  const runs = activeRuns(services);
  if (runs.length === 0) {
    return formatIdleRunSummary(services);
  }
  if (runs.length > 1) {
    return `${runs.length} active runs · bridge=${bridgeStatus(services)}`;
  }

  const [run] = runs;
  const approvals =
    run.pendingApprovals > 0 ? ` · approvals ${run.pendingApprovals}` : "";
  const action = run.activeAction ? ` · ${run.activeAction}` : "";
  return `${run.status} · ${run.runDepth} · cap ${run.configuredMaxIterations} · steps ${run.observedActionCount}${approvals}${action}`;
}

export function createRunContributor(
  services: AppServices,
): AwarenessContributor {
  return {
    id: "run",
    position: 15,
    trusted: true,
    cacheTtl: 5_000,
    summary: async () => formatActiveRunSummary(services),
    detail: async () => formatRunDetail(services),
  };
}
