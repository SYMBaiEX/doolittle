import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";
import type { DelegationTaskFilter } from "./types";

export function resolveDelegationOrchestrationMode(
  mode?: DelegationOrchestrationMode,
  executionMode?: DelegationTaskRecord["executionMode"],
): DelegationOrchestrationMode {
  if (mode) {
    return mode;
  }
  return executionMode === "delegated" ? "parallel" : "sequential";
}

export function matchDelegationTaskFilter(
  task: DelegationTaskRecord,
  filter?: DelegationTaskFilter,
): boolean {
  if (!filter) {
    return true;
  }
  if (
    filter.group &&
    (task.group ?? task.profile ?? "default") !== filter.group
  ) {
    return false;
  }
  if (filter.profile && task.profile !== filter.profile) {
    return false;
  }
  if (filter.priority && task.priority !== filter.priority) {
    return false;
  }
  if (filter.parentTaskId && task.parentTaskId !== filter.parentTaskId) {
    return false;
  }
  if (filter.status && task.status !== filter.status) {
    return false;
  }
  if (filter.executionMode && task.executionMode !== filter.executionMode) {
    return false;
  }
  if (filter.label) {
    const labels = task.labels ?? task.tags ?? [];
    if (!labels.includes(filter.label)) {
      return false;
    }
  }
  return true;
}

export function durationMs(
  startedAt?: string,
  completedAt?: string,
): number | undefined {
  if (!startedAt) {
    return undefined;
  }
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }
  return Math.max(0, end - start);
}
