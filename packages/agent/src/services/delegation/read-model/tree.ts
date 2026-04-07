import type { DelegationTaskRecord } from "@/types";
import { resolveDelegationOrchestrationMode } from "./helpers";
import type {
  DelegationAggregationItem,
  DelegationAggregationSummary,
  DelegationTaskTree,
} from "./types";

export function buildDelegationTaskTree(
  taskId: string,
  options: {
    getTask: (taskId: string) => DelegationTaskRecord;
    listChildren: (parentTaskId: string) => DelegationTaskRecord[];
  },
): DelegationTaskTree {
  const task = options.getTask(taskId);
  return {
    task,
    children: options
      .listChildren(task.id)
      .map((child) => buildDelegationTaskTree(child.id, options)),
  };
}

export function buildDelegationAggregationSummary(
  rootTaskId: string,
  options: {
    getTask: (taskId: string) => DelegationTaskRecord;
    isProcessAlive: (pid?: number) => boolean;
  },
): DelegationAggregationSummary {
  const root = options.getTask(rootTaskId);
  const rows: Array<{ task: DelegationTaskRecord; depth: number }> = [];
  const visit = (taskId: string, depth: number): void => {
    const task = options.getTask(taskId);
    rows.push({ task, depth });
    for (const childId of task.childTaskIds ?? []) {
      visit(childId, depth + 1);
    }
  };
  visit(root.id, 0);

  const completedOutputs: DelegationAggregationItem[] = [];
  const blockers: DelegationAggregationItem[] = [];
  let completedTasks = 0;
  let failedTasks = 0;
  let cancelledTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;
  let maxDepth = 0;
  let activeWorkers = 0;
  let stalledWorkers = 0;
  let leafTasks = 0;

  for (const { task, depth } of rows) {
    maxDepth = Math.max(maxDepth, depth);
    if ((task.childTaskIds ?? []).length === 0) {
      leafTasks += 1;
    }
    if (task.workerPid) {
      activeWorkers += 1;
      if (!options.isProcessAlive(task.workerPid)) {
        stalledWorkers += 1;
      }
    }

    const item: DelegationAggregationItem = {
      id: task.id,
      title: task.title,
      status: task.status,
      depth,
      executionMode: task.executionMode,
      orchestrationMode: resolveDelegationOrchestrationMode(
        task.orchestrationMode,
        task.executionMode,
      ),
      attempts: task.attempts ?? 0,
      maxAttempts: task.maxAttempts ?? 3,
      lastNote: task.notes.at(-1),
      lastOutputPath: task.lastOutputPath,
    };

    if (task.status === "completed") {
      completedTasks += 1;
      completedOutputs.push(item);
      continue;
    }
    if (task.status === "failed") {
      failedTasks += 1;
      blockers.push(item);
      continue;
    }
    if (task.status === "cancelled") {
      cancelledTasks += 1;
      blockers.push(item);
      continue;
    }
    if (task.status === "running") {
      runningTasks += 1;
      blockers.push(item);
      continue;
    }
    pendingTasks += 1;
    blockers.push(item);
  }

  return {
    rootTaskId: root.id,
    orchestrationMode: resolveDelegationOrchestrationMode(
      root.orchestrationMode,
      root.executionMode,
    ),
    totalTasks: rows.length,
    completedTasks,
    failedTasks,
    cancelledTasks,
    runningTasks,
    pendingTasks,
    completionRate:
      rows.length > 0 ? Number((completedTasks / rows.length).toFixed(3)) : 0,
    maxDepth,
    activeWorkers,
    stalledWorkers,
    leafTasks,
    completedOutputs,
    blockers,
  };
}
