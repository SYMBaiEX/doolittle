import type { DelegationTaskRecord } from "@/types";
import type { DelegationTaskFilter } from "./read-model";
import { matchDelegationTaskFilter } from "./read-model";

function isRetryableTask(task: DelegationTaskRecord): boolean {
  return (
    task.status === "pending" ||
    (task.status === "failed" && (task.attempts ?? 0) < (task.maxAttempts ?? 3))
  );
}

export function listPendingDelegationTasks(
  tasks: DelegationTaskRecord[],
  filter?: DelegationTaskFilter,
): DelegationTaskRecord[] {
  return tasks
    .filter((task) => matchDelegationTaskFilter(task, filter))
    .filter((task) => isRetryableTask(task))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildDelegationSkippedTasks(
  tasks: DelegationTaskRecord[],
  filter?: DelegationTaskFilter,
): Array<{ id: string; reason: string }> {
  return tasks
    .filter((task) => isRetryableTask(task))
    .filter((task) => !matchDelegationTaskFilter(task, filter))
    .map((task) => ({
      id: task.id,
      reason: "Filtered out by the current supervision selector.",
    }));
}
