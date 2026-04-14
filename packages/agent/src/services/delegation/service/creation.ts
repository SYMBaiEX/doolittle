import type { DelegationTaskRecord } from "@/types";
import {
  addDelegationTaskNote,
  createDelegationTask,
  spawnDelegationChildTask,
} from "../crud";
import type {
  DelegationCreateInput,
  DelegationMutationContext,
} from "../service-types";

export function createDelegationTaskWithSupport(
  context: DelegationMutationContext,
  input: DelegationCreateInput,
): DelegationTaskRecord {
  return createDelegationTask(context, input);
}

export function spawnDelegationChildTaskWithSupport(
  context: DelegationMutationContext,
  parentId: string,
  input: Omit<DelegationCreateInput, "parentTaskId">,
): DelegationTaskRecord {
  return spawnDelegationChildTask(context, parentId, input);
}

export function addDelegationTaskNoteWithSupport(
  context: DelegationMutationContext,
  taskId: string,
  note: string,
): DelegationTaskRecord {
  return addDelegationTaskNote(context, taskId, note);
}
