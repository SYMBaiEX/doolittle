import type { DelegationTaskRecord } from "@/types";
import {
  cascadeDelegationDescendants,
  propagateDelegationChildNotes,
} from "../child-propagation";
import {
  cancelDelegationTask,
  completeDelegationTask,
  failDelegationTask,
  markDelegationTaskRunning,
  markDelegationWorkerStarted,
  requeueDelegationTask,
} from "../lifecycle";
import type {
  DelegationMutationContext,
  DelegationWorkerStartInput,
} from "../service-types";

export interface DelegationServiceMutationBindings {
  mutationContext(): DelegationMutationContext;
  listChildren(parentTaskId: string): DelegationTaskRecord[];
  addNote(taskId: string, note: string): DelegationTaskRecord;
  cancel(
    taskId: string,
    note: string | undefined,
    options: { cascadeChildren: false },
  ): DelegationTaskRecord;
  requeue(
    taskId: string,
    note: string | undefined,
    options: { cascadeChildren: false },
  ): DelegationTaskRecord;
}

export function markDelegationTaskRunningMutations(
  bindings: Pick<DelegationServiceMutationBindings, "mutationContext">,
  id: string,
): DelegationTaskRecord {
  return markDelegationTaskRunning(bindings.mutationContext(), id);
}

export function markDelegationWorkerStartedMutations(
  bindings: Pick<DelegationServiceMutationBindings, "mutationContext">,
  id: string,
  worker: DelegationWorkerStartInput,
): DelegationTaskRecord {
  return markDelegationWorkerStarted(bindings.mutationContext(), id, worker);
}

export function completeDelegationTaskMutations(
  bindings: Pick<DelegationServiceMutationBindings, "mutationContext">,
  id: string,
  note?: string,
): DelegationTaskRecord {
  return completeDelegationTask(bindings.mutationContext(), id, note);
}

export function failDelegationTaskMutations(
  bindings: DelegationServiceMutationBindings,
  id: string,
  note: string,
  options?: { cascadeChildren?: boolean },
): DelegationTaskRecord {
  const failedTask = failDelegationTask(bindings.mutationContext(), id, note);
  if (options?.cascadeChildren) {
    cascadeDelegationFailureNotes(
      id,
      note,
      bindings.listChildren,
      bindings.addNote,
    );
  }
  return failedTask;
}

export function cancelDelegationTaskMutations(
  bindings: DelegationServiceMutationBindings,
  id: string,
  note?: string,
  options?: { cascadeChildren?: boolean },
): DelegationTaskRecord {
  const cancelledTask = cancelDelegationTask(
    bindings.mutationContext(),
    id,
    note,
  );
  if (options?.cascadeChildren !== false) {
    cascadeDelegationCancellation(
      id,
      note,
      bindings.listChildren,
      bindings.cancel,
    );
  }
  return cancelledTask;
}

export function requeueDelegationTaskMutations(
  bindings: DelegationServiceMutationBindings,
  id: string,
  note?: string,
  options?: { cascadeChildren?: boolean },
): DelegationTaskRecord {
  const requeuedTask = requeueDelegationTask(
    bindings.mutationContext(),
    id,
    note,
  );
  if (options?.cascadeChildren) {
    cascadeDelegationRequeue(id, note, bindings.listChildren, bindings.requeue);
  }
  return requeuedTask;
}

function cascadeDelegationFailureNotes(
  id: string,
  note: string,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  addNote: (taskId: string, childNote: string) => DelegationTaskRecord,
): void {
  propagateDelegationChildNotes(
    id,
    `system: parent task failed: ${note}`,
    listChildren,
    addNote,
  );
}

function cascadeDelegationCancellation(
  id: string,
  note: string | undefined,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  cancel: (
    taskId: string,
    childNote: string,
    options: { cascadeChildren: false },
  ) => DelegationTaskRecord,
): void {
  cascadeDelegationDescendants(id, listChildren, (child, parentTaskId) => {
    cancel(
      child.id,
      note ?? `Cancelled because parent ${parentTaskId} was cancelled.`,
      {
        cascadeChildren: false,
      },
    );
  });
}

function cascadeDelegationRequeue(
  id: string,
  note: string | undefined,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  requeue: (
    taskId: string,
    childNote: string,
    options: { cascadeChildren: false },
  ) => DelegationTaskRecord,
): void {
  cascadeDelegationDescendants(id, listChildren, (child, parentTaskId) => {
    requeue(
      child.id,
      note ?? `Requeued because parent ${parentTaskId} was requeued.`,
      {
        cascadeChildren: false,
      },
    );
  });
}
