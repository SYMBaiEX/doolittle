import type { DelegationTaskRecord } from "@/types";
import { listPendingDelegationTasks } from "./queue";
import type { DelegationTaskFilter } from "./read-model";
import { matchDelegationTaskFilter } from "./read-model";
import type {
  DelegationCreateInput,
  DelegationMutationContext,
} from "./service-types";
import { getDelegationTaskOrThrow, updateDelegationTask } from "./state";
import {
  createDelegationChildInput,
  createDelegationTaskRecord,
  linkDelegationChildTask,
} from "./task-mutations";

export function listDelegationTasks(
  tasks: DelegationTaskRecord[],
  filter?: DelegationTaskFilter,
): DelegationTaskRecord[] {
  return tasks
    .filter((task) => matchDelegationTaskFilter(task, filter))
    .slice()
    .reverse();
}

export function createDelegationTask(
  context: DelegationMutationContext,
  input: DelegationCreateInput,
): DelegationTaskRecord {
  const store = context.read();
  const task = createDelegationTaskRecord(input);
  store.tasks.push(task);
  linkDelegationChildTask(
    store.tasks,
    input.parentTaskId,
    task.id,
    task.createdAt,
  );
  context.write(store);
  context.emitUpdate("created", task);
  return task;
}

export function spawnDelegationChildTask(
  context: DelegationMutationContext,
  parentId: string,
  input: Omit<DelegationCreateInput, "parentTaskId">,
): DelegationTaskRecord {
  const parent = getDelegationTaskOrThrow(context.read().tasks, parentId);
  return createDelegationTask(
    context,
    createDelegationChildInput(parent, input),
  );
}

export function addDelegationTaskNote(
  context: DelegationMutationContext,
  id: string,
  note: string,
): DelegationTaskRecord {
  return updateDelegationNote(context, id, note);
}

export function getDelegationTask(
  tasks: DelegationTaskRecord[],
  id: string,
): DelegationTaskRecord {
  return getDelegationTaskOrThrow(tasks, id);
}

export function listPendingDelegationTasksForStore(
  tasks: DelegationTaskRecord[],
  filter?: DelegationTaskFilter,
): DelegationTaskRecord[] {
  return listPendingDelegationTasks(tasks, filter);
}

export function listDelegationChildren(
  tasks: DelegationTaskRecord[],
  parentTaskId: string,
): DelegationTaskRecord[] {
  return listDelegationTasks(tasks, { parentTaskId });
}

function updateDelegationNote(
  context: DelegationMutationContext,
  id: string,
  note: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    task.notes.push(note);
  });
}
