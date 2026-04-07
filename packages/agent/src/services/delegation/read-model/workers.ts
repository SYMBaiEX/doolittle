import type { DelegationTaskRecord } from "@/types";
import { durationMs, matchDelegationTaskFilter } from "./helpers";
import type { DelegationTaskFilter, DelegationWorkerStatus } from "./types";

export function buildDelegationWorkerStatuses(
  tasks: DelegationTaskRecord[],
  options: {
    limit: number;
    filter?: DelegationTaskFilter;
    isProcessAlive: (pid?: number) => boolean;
  },
): DelegationWorkerStatus[] {
  return tasks
    .filter((task) => matchDelegationTaskFilter(task, options.filter))
    .filter(
      (task) =>
        task.status === "running" ||
        task.workerPid !== undefined ||
        task.lastOutputPath !== undefined ||
        task.executionMode === "delegated",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, options.limit)
    .map((task) => {
      const alive = task.workerPid
        ? options.isProcessAlive(task.workerPid)
        : false;
      const attemptsRemaining = Math.max(
        0,
        (task.maxAttempts ?? 3) - (task.attempts ?? 0),
      );
      return {
        id: task.id,
        title: task.title,
        objective: task.objective,
        group: task.group,
        profile: task.profile,
        priority: task.priority,
        tags: task.tags ?? [],
        labels: task.labels ?? task.tags ?? [],
        metadata: task.metadata ?? {},
        parentTaskId: task.parentTaskId,
        childTaskIds: task.childTaskIds ?? [],
        status: task.status,
        executionMode: task.executionMode,
        workerMode: task.workerMode,
        workerPid: task.workerPid,
        attempts: task.attempts ?? 0,
        attemptsRemaining,
        maxAttempts: task.maxAttempts ?? 3,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        lastOutputPath: task.lastOutputPath,
        alive,
        stalled: Boolean(task.workerPid && !alive),
        durationMs: durationMs(task.startedAt, task.completedAt),
        notesCount: task.notes.length,
      };
    });
}
