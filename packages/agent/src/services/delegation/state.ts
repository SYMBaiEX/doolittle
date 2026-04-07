import type { DelegationTaskRecord } from "@/types";

import type { DelegationMutationContext } from "./service-types";

export function getDelegationTaskOrThrow(
  tasks: DelegationTaskRecord[],
  id: string,
): DelegationTaskRecord {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) {
    throw new Error(`Delegation task not found: ${id}`);
  }
  return task;
}

export function updateDelegationTask(
  context: DelegationMutationContext,
  id: string,
  mutate: (task: DelegationTaskRecord) => void,
): DelegationTaskRecord {
  const store = context.read();
  const task = getDelegationTaskOrThrow(store.tasks, id);
  mutate(task);
  task.updatedAt = new Date().toISOString();
  context.write(store);
  context.emitUpdate("updated", task);
  return task;
}
