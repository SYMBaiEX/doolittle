import {
  buildDelegationServiceAggregation,
  buildDelegationServiceOverview,
  buildDelegationServiceTree,
} from "@/services/delegation/reporting";
import type { DelegationTaskRecord } from "@/types";
import type { RuntimeLike } from "../runtime";
import {
  projectOfficialTask,
  projectOfficialTaskList,
  requireOfficialOrchestrator,
  updateDelegationProjection,
} from "./official";

async function listOfficialTaskDetails(runtime: RuntimeLike) {
  const service = requireOfficialOrchestrator(runtime);
  const summaries = await service.listTasks({
    includeArchived: true,
    limit: 500,
  });
  const details = await Promise.all(
    summaries.map((task) => service.getTask(task.id)),
  );
  return details.filter((task) => task !== null);
}

export async function getEffectiveDelegationTasks(
  runtime: RuntimeLike,
  services?: unknown,
) {
  const tasks = projectOfficialTaskList(await listOfficialTaskDetails(runtime));
  updateDelegationProjection(services, tasks);
  return tasks;
}

export async function getEffectiveDelegationQueue(
  runtime: RuntimeLike,
  _services?: unknown,
) {
  const service = requireOfficialOrchestrator(runtime);
  const [status, tasks] = await Promise.all([
    service.getStatus(),
    getEffectiveDelegationTasks(runtime),
  ]);
  return {
    ...buildDelegationServiceOverview(tasks, status.activeSessionCount),
    service: "ORCHESTRATOR_TASK_SERVICE",
    available: true,
  };
}

export async function getEffectiveDelegationOverview(
  runtime: RuntimeLike,
  _services?: unknown,
) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationServiceOverview(
    tasks,
    tasks.filter((task) => task.status === "running").length,
  );
}

export async function getEffectiveDelegationTask(
  runtime: RuntimeLike,
  _services: unknown,
  id: string,
) {
  const task = await requireOfficialOrchestrator(runtime).getTask(id);
  return task ? projectOfficialTask(task) : null;
}

export async function getEffectiveDelegationChildren(
  runtime: RuntimeLike,
  _services: unknown,
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
  _services: unknown,
  id: string,
) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationServiceTree(
    id,
    (taskId) => taskById(tasks, taskId),
    (parentId) => tasks.filter((task) => task.parentTaskId === parentId),
  );
}

export async function getEffectiveDelegationAggregation(
  runtime: RuntimeLike,
  _services: unknown,
  id: string,
) {
  const tasks = await getEffectiveDelegationTasks(runtime);
  return buildDelegationServiceAggregation(id, (taskId) =>
    taskById(tasks, taskId),
  );
}
