import type { DelegationTaskRecord } from "@/types";
import {
  getDelegationTask,
  listDelegationChildren,
  listDelegationTasks,
  listPendingDelegationTasksForStore,
} from "../crud";
import type { DelegationTaskFilter, DelegationTaskTree } from "../read-model";
import { buildDelegationServiceTree } from "../reporting";

export function listDelegationServiceTasks(
  read: () => { tasks: DelegationTaskRecord[] },
  filter?: DelegationTaskFilter,
): DelegationTaskRecord[] {
  return listDelegationTasks(read().tasks, filter);
}

export function pendingDelegationServiceTasks(
  read: () => { tasks: DelegationTaskRecord[] },
  filter?: DelegationTaskFilter,
): DelegationTaskRecord[] {
  return listPendingDelegationTasksForStore(read().tasks, filter);
}

export function getDelegationTaskById(
  read: () => { tasks: DelegationTaskRecord[] },
  id: string,
): DelegationTaskRecord {
  return getDelegationTask(read().tasks, id);
}

export function listDelegationServiceChildren(
  read: () => { tasks: DelegationTaskRecord[] },
  parentTaskId: string,
): DelegationTaskRecord[] {
  return listDelegationChildren(read().tasks, parentTaskId);
}

export function listDelegationServiceByGroup(
  read: () => { tasks: DelegationTaskRecord[] },
  group: string,
): DelegationTaskRecord[] {
  return listDelegationServiceTasks(read, { group });
}

export function listDelegationServiceByLabel(
  read: () => { tasks: DelegationTaskRecord[] },
  label: string,
): DelegationTaskRecord[] {
  return listDelegationServiceTasks(read, { label });
}

export function listDelegationServiceByProfile(
  read: () => { tasks: DelegationTaskRecord[] },
  profile: string,
): DelegationTaskRecord[] {
  return listDelegationServiceTasks(read, { profile });
}

export function buildDelegationServiceTreeById(
  id: string,
  read: () => { tasks: DelegationTaskRecord[] },
): DelegationTaskTree {
  const getTask = (taskId: string) => getDelegationTask(read().tasks, taskId);
  const listChildren = (taskId: string) =>
    listDelegationServiceChildren(read, taskId);
  return buildDelegationServiceTree(id, getTask, listChildren);
}
