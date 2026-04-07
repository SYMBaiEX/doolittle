import type { DelegationTaskRecord } from "@/types";
import { resolveDelegationOrchestrationMode } from "./helpers";
import type { DelegationOverview } from "./types";

export function buildDelegationOverview(
  tasks: DelegationTaskRecord[],
  options: {
    activeExecutions: number;
    isProcessAlive: (pid?: number) => boolean;
  },
): DelegationOverview {
  const profileCounts = new Map<string, number>();
  const priorityCounts = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const orchestrationCounts = new Map<
    DelegationOverview["byOrchestration"][number]["mode"],
    number
  >();
  const counts = tasks.reduce<DelegationOverview>(
    (acc, task) => {
      acc.total += 1;
      acc[task.status] += 1;
      acc[task.executionMode] += 1;
      if (task.workerMode === "inline") {
        acc.inlineWorkers += 1;
      }
      if (task.workerMode === "process") {
        acc.processWorkers += 1;
      }
      if (task.workerPid) {
        acc.activeWorkers += 1;
        if (options.isProcessAlive(task.workerPid)) {
          acc.aliveWorkers += 1;
        } else {
          acc.stalledWorkers += 1;
        }
      }
      if (
        task.status === "failed" &&
        (task.attempts ?? 0) < (task.maxAttempts ?? 3)
      ) {
        acc.retryable += 1;
      }
      if (task.profile) {
        profileCounts.set(
          task.profile,
          (profileCounts.get(task.profile) ?? 0) + 1,
        );
      }
      priorityCounts.set(
        task.priority ?? "normal",
        (priorityCounts.get(task.priority ?? "normal") ?? 0) + 1,
      );
      groupCounts.set(
        task.group ?? task.profile ?? "default",
        (groupCounts.get(task.group ?? task.profile ?? "default") ?? 0) + 1,
      );
      for (const label of task.labels ?? task.tags ?? []) {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
      const orchestrationMode = resolveDelegationOrchestrationMode(
        task.orchestrationMode,
        task.executionMode,
      );
      orchestrationCounts.set(
        orchestrationMode,
        (orchestrationCounts.get(orchestrationMode) ?? 0) + 1,
      );
      return acc;
    },
    {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retryable: 0,
      delegated: 0,
      local: 0,
      inlineWorkers: 0,
      processWorkers: 0,
      activeWorkers: 0,
      aliveWorkers: 0,
      stalledWorkers: 0,
      concurrency: options.activeExecutions,
      byProfile: [],
      byPriority: [],
      byGroup: [],
      byLabel: [],
      byOrchestration: [],
    },
  );

  counts.byProfile = Array.from(profileCounts.entries())
    .map(([profile, count]) => ({ profile, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.profile.localeCompare(right.profile),
    );
  counts.byPriority = Array.from(priorityCounts.entries())
    .map(([priority, count]) => ({ priority, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.priority.localeCompare(right.priority),
    );
  counts.byGroup = Array.from(groupCounts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.group.localeCompare(right.group),
    );
  counts.byLabel = Array.from(labelCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
  counts.byOrchestration = Array.from(orchestrationCounts.entries())
    .map(([mode, count]) => ({ mode, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.mode.localeCompare(right.mode),
    );

  return counts;
}
