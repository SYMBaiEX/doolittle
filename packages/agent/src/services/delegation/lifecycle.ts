import type { DelegationTaskRecord } from "@/types";
import type {
  DelegationMutationContext,
  DelegationWorkerStartInput,
} from "./service-types";
import { updateDelegationTask } from "./state";
import {
  applyDelegationTaskCancellation,
  applyDelegationTaskCompletion,
  applyDelegationTaskFailure,
  applyDelegationTaskRequeue,
  applyDelegationTaskRunning,
  applyDelegationWorkerStarted,
} from "./task-mutations";

export function markDelegationTaskRunning(
  context: DelegationMutationContext,
  id: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationTaskRunning(task);
  });
}

export function markDelegationWorkerStarted(
  context: DelegationMutationContext,
  id: string,
  worker: DelegationWorkerStartInput,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationWorkerStarted(task, worker);
  });
}

export function completeDelegationTask(
  context: DelegationMutationContext,
  id: string,
  note?: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationTaskCompletion(task, note);
  });
}

export function failDelegationTask(
  context: DelegationMutationContext,
  id: string,
  note: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationTaskFailure(task, note);
  });
}

export function cancelDelegationTask(
  context: DelegationMutationContext,
  id: string,
  note?: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationTaskCancellation(task, note);
  });
}

export function requeueDelegationTask(
  context: DelegationMutationContext,
  id: string,
  note?: string,
): DelegationTaskRecord {
  return updateDelegationTask(context, id, (task) => {
    applyDelegationTaskRequeue(task, note);
  });
}
