import { orchestrationStatusTier } from "../orchestration-helpers";
import type { DelegationTaskRecord } from "../orchestration-resources";

export type TaskQueueTier =
  | "all"
  | "queued"
  | "running"
  | "approval"
  | "completed"
  | "failed";

const TASK_QUEUE_TIER_ORDER: readonly Exclude<TaskQueueTier, "all">[] = [
  "running",
  "approval",
  "queued",
  "failed",
  "completed",
];

function searchableTaskText(task: DelegationTaskRecord): string {
  return [
    task.title,
    task.objective,
    task.status,
    task.priority,
    task.group,
    task.kind,
    task.capabilityProfile,
    task.framework,
    task.accountLabel,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}

export function availableTaskQueueTiers(
  tasks: readonly DelegationTaskRecord[],
): readonly TaskQueueTier[] {
  const present = new Set(
    tasks.map((task) => orchestrationStatusTier(task.status ?? "pending")),
  );
  return ["all", ...TASK_QUEUE_TIER_ORDER.filter((tier) => present.has(tier))];
}

export function filterTaskQueue(
  tasks: readonly DelegationTaskRecord[],
  filters: { query: string; tier: TaskQueueTier },
): readonly DelegationTaskRecord[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    if (
      filters.tier !== "all" &&
      orchestrationStatusTier(task.status ?? "pending") !== filters.tier
    ) {
      return false;
    }
    return !query || searchableTaskText(task).includes(query);
  });
}
