import type {
  DelegationServiceMutationFacade,
  DelegationServiceReadFacade,
} from "./api-types";
import {
  addDelegationTaskNoteWithSupport,
  createDelegationTaskWithSupport,
  spawnDelegationChildTaskWithSupport,
} from "./creation";
import type { DelegationServiceMutationBindings } from "./mutations";
import {
  cancelDelegationTaskMutations,
  completeDelegationTaskMutations,
  failDelegationTaskMutations,
  markDelegationTaskRunningMutations,
  markDelegationWorkerStartedMutations,
  requeueDelegationTaskMutations,
} from "./mutations";
import type { DelegationServiceSupport } from "./support";

export function createDelegationServiceMutationFacade(
  support: DelegationServiceSupport,
  reads: Pick<DelegationServiceReadFacade, "listChildren">,
): DelegationServiceMutationFacade {
  const mutationContext = () => support.mutationContext();

  function create(
    input: Parameters<DelegationServiceMutationFacade["create"]>[0],
  ) {
    return createDelegationTaskWithSupport(mutationContext(), input);
  }

  function spawnChild(
    parentId: Parameters<DelegationServiceMutationFacade["spawnChild"]>[0],
    input: Parameters<DelegationServiceMutationFacade["spawnChild"]>[1],
  ) {
    return spawnDelegationChildTaskWithSupport(
      mutationContext(),
      parentId,
      input,
    );
  }

  function addNote(
    id: Parameters<DelegationServiceMutationFacade["addNote"]>[0],
    note: Parameters<DelegationServiceMutationFacade["addNote"]>[1],
  ) {
    return addDelegationTaskNoteWithSupport(mutationContext(), id, note);
  }

  function cancel(
    id: Parameters<DelegationServiceMutationFacade["cancel"]>[0],
    note?: Parameters<DelegationServiceMutationFacade["cancel"]>[1],
    options?: Parameters<DelegationServiceMutationFacade["cancel"]>[2],
  ) {
    return cancelDelegationTaskMutations(bindings, id, note, options);
  }

  function requeue(
    id: Parameters<DelegationServiceMutationFacade["requeue"]>[0],
    note?: Parameters<DelegationServiceMutationFacade["requeue"]>[1],
    options?: Parameters<DelegationServiceMutationFacade["requeue"]>[2],
  ) {
    return requeueDelegationTaskMutations(bindings, id, note, options);
  }

  const bindings: DelegationServiceMutationBindings = {
    mutationContext,
    listChildren: reads.listChildren,
    addNote,
    cancel: (id, note, options) => cancel(id, note, options),
    requeue: (id, note, options) => requeue(id, note, options),
  };

  return {
    create,
    spawnChild,
    addNote,
    markRunning: (id) => markDelegationTaskRunningMutations(bindings, id),
    markWorkerStarted: (id, worker) =>
      markDelegationWorkerStartedMutations(bindings, id, worker),
    complete: (id, note) => completeDelegationTaskMutations(bindings, id, note),
    fail: (id, note, options) =>
      failDelegationTaskMutations(bindings, id, note, options),
    cancel,
    requeue,
  };
}
