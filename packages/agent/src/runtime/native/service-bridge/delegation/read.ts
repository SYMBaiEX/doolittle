import {
  buildDelegationProjectionAggregation,
  buildDelegationProjectionOverview,
  buildDelegationProjectionTree,
} from "@/services/delegation/reporting";
import type { DelegationTaskRecord } from "@/types";
import type { RuntimeLike } from "../runtime";
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

async function listAndReconcileOfficialTaskDetails(runtime: RuntimeLike) {
  const service = requireOfficialOrchestrator(runtime);
  const summaries = await service.listTasks({
    includeArchived: true,
    limit: 500,
  });
  const details = await Promise.all(
    summaries.map((task) => service.getTask(task.id)),
  );
  const reconciled = await Promise.all(
    details.map(async (task) => {
      const receipt = task && researchRunReceipt(task.metadata);
      if (
        !task ||
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
    }),
  );
  return reconciled.filter(
    (task): task is NonNullable<typeof task> => task !== null,
  );
}

type OfficialTaskDetails = Awaited<
  ReturnType<typeof listAndReconcileOfficialTaskDetails>
>;

const officialTaskDetailReads = new WeakMap<
  object,
  Promise<OfficialTaskDetails>
>();

async function listOfficialTaskDetails(runtime: RuntimeLike) {
  // Projection refresh is the first durable delegation seam during startup.
  // Only non-live sessionless runs are reconciled, so in-process RESEARCH work
  // is never mistaken for a post-restart orphan.
  // The desktop requests tasks and both overview variants together. Share that
  // native expansion so one navigation does not fan out into three list +
  // getTask passes over the same durable records.
  const runtimeKey = runtime as object;
  const current = officialTaskDetailReads.get(runtimeKey);
  if (current) return current;

  const pending = listAndReconcileOfficialTaskDetails(runtime);
  officialTaskDetailReads.set(runtimeKey, pending);
  try {
    return await pending;
  } finally {
    if (officialTaskDetailReads.get(runtimeKey) === pending) {
      officialTaskDetailReads.delete(runtimeKey);
    }
  }
}

export async function getEffectiveDelegationTasks(runtime: RuntimeLike) {
  return projectOfficialTaskList(await listOfficialTaskDetails(runtime));
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

export async function getEffectiveDelegationTask(
  runtime: RuntimeLike,
  id: string,
) {
  const task = await requireOfficialOrchestrator(runtime).getTask(id);
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
