import type { AgentOrchestratorDelegationQueueSummaryLike } from "./contracts";

export function countPending(
  queue: AgentOrchestratorDelegationQueueSummaryLike,
): number {
  return queue.pending ?? queue.total ?? 0;
}

export function countActiveWorkers(
  queue: AgentOrchestratorDelegationQueueSummaryLike,
): number {
  return queue.activeWorkers ?? 0;
}
