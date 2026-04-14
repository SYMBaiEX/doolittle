import {
  getEffectiveDelegationChildren,
  getEffectiveDelegationTask,
  getEffectiveDelegationTree,
} from "@/runtime/native/service-bridge/delegation";
import {
  type DelegationReadHandler,
  type DelegationReadTask,
  formatDelegationChildTask,
} from "./shared";

export const handleDelegationDetailsRead: DelegationReadHandler = async (
  trimmed,
  context,
) => {
  if (trimmed.startsWith("/delegate children ")) {
    const id = trimmed.replace("/delegate children ", "").trim();
    if (!id) {
      return "Usage: /delegate children <parent-id>";
    }
    const tasks = getEffectiveDelegationChildren(
      context.runtime,
      context.services,
      id,
    ) as DelegationReadTask[];
    return tasks.length
      ? tasks.map((task) => formatDelegationChildTask(task)).join("\n\n")
      : `No child delegation tasks found for ${id}.`;
  }

  if (trimmed.startsWith("/delegate tree ")) {
    const id = trimmed.replace("/delegate tree ", "").trim();
    if (!id) {
      return "Usage: /delegate tree <task-id>";
    }
    return JSON.stringify(
      getEffectiveDelegationTree(context.runtime, context.services, id),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate status ")) {
    const id = trimmed.replace("/delegate status ", "").trim();
    return JSON.stringify(
      getEffectiveDelegationTask(context.runtime, context.services, id),
      null,
      2,
    );
  }

  return undefined;
};
