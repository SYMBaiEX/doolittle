import {
  buildDelegationProjectionAggregation,
  buildDelegationProjectionOverview,
  buildDelegationProjectionTree,
} from "@/services/delegation/reporting";
import type { DelegationTaskRecord } from "@/types";
import type { RuntimeLike } from "../runtime";
import type {
  NativeAgentOrchestratorService,
  NativeOrchestratorTaskDetail,
  NativeOrchestratorTaskThread,
} from "../runtime-contracts";
import {
  projectOfficialTask,
  projectOfficialTaskList,
  requireOfficialOrchestrator,
} from "./official";
import {
  isLiveResearchRun,
  isSessionlessResearchTask,
  researchRunReceipt,
} from "./research-run";

async function reconcileOfficialTaskDetail(
  service: NativeAgentOrchestratorService,
  task: NativeOrchestratorTaskDetail,
) {
  const receipt = researchRunReceipt(task.metadata);
  if (
    !(
      isSessionlessResearchTask(task) &&
      receipt?.status === "active" &&
      typeof receipt.runId === "string" &&
      !isLiveResearchRun(task.id, receipt.runId)
    )
  ) {
    return task;
  }
  const interruptedAt = new Date().toISOString();
  const updated = await service.updateTask(task.id, {
    status: "interrupted",
    closedAt: interruptedAt,
    metadata: {
      ...task.metadata,
      researchRun: {
        ...receipt,
        status: "interrupted",
        interruptedAt,
        interruption: "reconciled-after-restart",
      },
    },
  });
  // A failed reconciliation write must not invent a state that the official
  // service did not persist. Keep the original detail for this refresh.
  return updated ?? task;
}

type OfficialTaskDetailRead = Promise<NativeOrchestratorTaskDetail | null>;
const officialTaskReads = new WeakMap<
  object,
  Map<string, OfficialTaskDetailRead>
>();

async function readAndReconcileOfficialTaskDetail(
  runtime: RuntimeLike,
  id: string,
) {
  const runtimeKey = runtime as object;
  let cache = officialTaskReads.get(runtimeKey);
  if (!cache) {
    cache = new Map<string, OfficialTaskDetailRead>();
    officialTaskReads.set(runtimeKey, cache);
  }
  const current = cache.get(id);
  if (current) return current;

  const service = requireOfficialOrchestrator(runtime);
  const pending = service
    .getTask(id)
    .then((task) => (task ? reconcileOfficialTaskDetail(service, task) : null));
  cache.set(id, pending);
  try {
    return await pending;
  } finally {
    if (cache.get(id) === pending) cache.delete(id);
    if (cache.size === 0 && officialTaskReads.get(runtimeKey) === cache) {
      officialTaskReads.delete(runtimeKey);
    }
  }
}

async function listAndReconcileOfficialTaskDetails(
  runtime: RuntimeLike,
  options?: { limit?: number },
) {
  const service = requireOfficialOrchestrator(runtime);
  const summaries = await service.listTasks({
    includeArchived: true,
    limit: options?.limit ?? 500,
  });
  const details = await Promise.all(
    summaries.map((task) => service.getTask(task.id)),
  );
  const reconciled = await Promise.all(
    details.map((task) =>
      task ? reconcileOfficialTaskDetail(service, task) : task,
    ),
  );
  return reconciled.filter(
    (task): task is NonNullable<typeof task> => task !== null,
  );
}

async function listOfficialTaskSummaries(
  runtime: RuntimeLike,
  options?: { limit?: number },
) {
  return requireOfficialOrchestrator(runtime).listTasks({
    includeArchived: true,
    limit: options?.limit ?? 500,
  });
}

async function listAndReconcileOfficialTaskSummaries(
  runtime: RuntimeLike,
  options?: { limit?: number },
): Promise<Array<NativeOrchestratorTaskThread | NativeOrchestratorTaskDetail>> {
  const summaries = await listOfficialTaskSummaries(runtime, options);
  return Promise.all(
    summaries.map(async (summary) => {
      // Doolittle's canonical sessionless research tasks use kind=research.
      // They are the only summary rows that need metadata inspection to retain
      // restart reconciliation. Coding rows remain one cheap listTasks read.
      if (summary.kind !== "research") return summary;
      return (
        (await readAndReconcileOfficialTaskDetail(runtime, summary.id)) ??
        summary
      );
    }),
  );
}

type OfficialTaskDetails = Awaited<
  ReturnType<typeof listAndReconcileOfficialTaskDetails>
>;

const officialTaskDetailReads = new WeakMap<
  object,
  Map<number, Promise<OfficialTaskDetails>>
>();

async function listOfficialTaskDetails(
  runtime: RuntimeLike,
  options?: { limit?: number },
) {
  // Projection refresh is the first durable delegation seam during startup.
  // Only non-live sessionless runs are reconciled, so in-process RESEARCH work
  // is never mistaken for a post-restart orphan.
  // The desktop requests tasks and both overview variants together. Share that
  // native expansion so one navigation does not fan out into three list +
  // getTask passes over the same durable records.
  const runtimeKey = runtime as object;
  const limit = options?.limit ?? 500;
  let cache = officialTaskDetailReads.get(runtimeKey);
  if (!cache) {
    cache = new Map<number, Promise<OfficialTaskDetails>>();
    officialTaskDetailReads.set(runtimeKey, cache);
  }
  const current = cache.get(limit);
  if (current) return current;

  const pending = listAndReconcileOfficialTaskDetails(runtime, { limit });
  cache.set(limit, pending);
  try {
    return await pending;
  } finally {
    if (cache.get(limit) === pending) {
      cache.delete(limit);
    }
    if (cache.size === 0 && officialTaskDetailReads.get(runtimeKey) === cache) {
      officialTaskDetailReads.delete(runtimeKey);
    }
  }
}

export async function getEffectiveDelegationTasks(
  runtime: RuntimeLike,
  options?: { limit?: number },
) {
  return projectOfficialTaskList(
    await listOfficialTaskDetails(runtime, options),
  );
}

export async function getEffectiveDelegationTaskSummaries(
  runtime: RuntimeLike,
  options?: { limit?: number },
) {
  return projectOfficialTaskList(
    await listAndReconcileOfficialTaskSummaries(runtime, options),
  );
}

export async function getEffectiveDelegationQueue(runtime: RuntimeLike) {
  const service = requireOfficialOrchestrator(runtime);
  const [status, tasks] = await Promise.all([
    service.getStatus(),
    getEffectiveDelegationTasks(runtime),
  ]);
  return {
    ...buildDelegationProjectionOverview(tasks, status.activeSessionCount),
    service: "ORCHESTRATOR_TASK_SERVICE",
    available: true,
  };
}

export async function getEffectiveDelegationOverview(runtime: RuntimeLike) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationProjectionOverview(
    tasks,
    tasks.filter((task) => task.status === "running").length,
  );
}

export async function getEffectiveDelegationOverviews(runtime: RuntimeLike) {
  const service = requireOfficialOrchestrator(runtime);
  const [status, tasks] = await Promise.all([
    service.getStatus(),
    getEffectiveDelegationTasks(runtime),
  ]);
  return {
    local: buildDelegationProjectionOverview(
      tasks,
      tasks.filter((task) => task.status === "running").length,
    ),
    native: {
      ...buildDelegationProjectionOverview(tasks, status.activeSessionCount),
      service: "ORCHESTRATOR_TASK_SERVICE",
      available: true,
    },
  };
}

export async function getEffectiveDelegationOverviewsSnapshot(
  runtime: RuntimeLike,
) {
  // The desktop startup surface consumes aggregate counts only. Do not return
  // full-looking group, label, worker, parent, or retry projections from task
  // summaries: those fields require detail reads and would otherwise be
  // misleading zero/default values. Canonical research rows still reconcile
  // restart receipts through the bounded summary bridge above.
  const service = requireOfficialOrchestrator(runtime);
  const [status, tasks] = await Promise.all([
    service.getStatus(),
    listAndReconcileOfficialTaskSummaries(runtime),
  ]);
  const projected = projectOfficialTaskList(tasks);
  const counts = {
    total: projected.length,
    pending: projected.filter((task) => task.status === "pending").length,
    running: projected.filter((task) => task.status === "running").length,
    completed: projected.filter((task) => task.status === "completed").length,
    failed: projected.filter((task) => task.status === "failed").length,
    cancelled: projected.filter((task) => task.status === "cancelled").length,
  };
  return {
    local: { ...counts, concurrency: counts.running },
    native: {
      ...counts,
      concurrency: status.activeSessionCount,
      service: "ORCHESTRATOR_TASK_SERVICE",
      available: true,
    },
  };
}

export async function getEffectiveDelegationTask(
  runtime: RuntimeLike,
  id: string,
) {
  const task = await readAndReconcileOfficialTaskDetail(runtime, id);
  return task ? projectOfficialTask(task) : null;
}

export async function getEffectiveDelegationChildren(
  runtime: RuntimeLike,
  parentId: string,
) {
  return (await getEffectiveDelegationTasks(runtime)).filter(
    (task) => task.parentTaskId === parentId,
  );
}

function taskById(
  tasks: DelegationTaskRecord[],
  id: string,
): DelegationTaskRecord {
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Delegation task not found: ${id}`);
  return task;
}

export async function getEffectiveDelegationTree(
  runtime: RuntimeLike,
  id: string,
) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationProjectionTree(
    id,
    (taskId) => taskById(tasks, taskId),
    (parentId) => tasks.filter((task) => task.parentTaskId === parentId),
  );
}

export async function getEffectiveDelegationAggregation(
  runtime: RuntimeLike,
  id: string,
) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationProjectionAggregation(id, (taskId) =>
    taskById(tasks, taskId),
  );
}
