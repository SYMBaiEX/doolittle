import {
  getEffectiveDelegationOverviews,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTasks,
} from "@/runtime/native/service-bridge/delegation";
import {
  type DelegationReadHandler,
  type DelegationReadTask,
  formatDelegationGroupTask,
  formatDelegationLabelTask,
  formatDelegationListTask,
  parseDelegationReadFilter,
} from "./shared";

export const handleDelegationListingsRead: DelegationReadHandler = async (
  trimmed,
  context,
) => {
  if (
    trimmed === "/delegate" ||
    trimmed === "/delegate list" ||
    trimmed.startsWith("/delegate list ")
  ) {
    const filters = parseDelegationReadFilter(trimmed, "/delegate list");
    const nativeTasks = await getEffectiveDelegationTasks(context.runtime);
    if (
      !filters.group &&
      !filters.profile &&
      !filters.priority &&
      !filters.label &&
      !filters.parentTaskId &&
      !filters.status &&
      !filters.executionMode &&
      Array.isArray(nativeTasks) &&
      nativeTasks.length
    ) {
      return JSON.stringify(nativeTasks.slice(0, 20), null, 2);
    }
    const tasks = nativeTasks
      .filter(
        (task) =>
          (!filters.group || task.group === filters.group) &&
          (!filters.profile || task.profile === filters.profile) &&
          (!filters.priority || task.priority === filters.priority) &&
          (!filters.label ||
            (task.labels ?? task.tags ?? []).includes(filters.label)) &&
          (!filters.parentTaskId ||
            task.parentTaskId === filters.parentTaskId) &&
          (!filters.status || task.status === filters.status) &&
          (!filters.executionMode ||
            task.executionMode === filters.executionMode),
      )
      .slice(0, 20);
    return tasks.length
      ? tasks.map((task) => formatDelegationListTask(task)).join("\n")
      : "No delegation tasks recorded.";
  }

  if (trimmed === "/delegate overview") {
    return JSON.stringify(
      await getEffectiveDelegationOverviews(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/delegate queue" || trimmed.startsWith("/delegate queue ")) {
    const nativeQueue = await getEffectiveDelegationQueue(context.runtime);
    if (trimmed === "/delegate queue" && nativeQueue) {
      return JSON.stringify(nativeQueue, null, 2);
    }
    const filters = parseDelegationReadFilter(trimmed, "/delegate queue");
    const tasks = (await getEffectiveDelegationTasks(context.runtime))
      .filter(
        (task) =>
          task.status === "pending" &&
          (!filters.group || task.group === filters.group) &&
          (!filters.profile || task.profile === filters.profile) &&
          (!filters.priority || task.priority === filters.priority) &&
          (!filters.label ||
            (task.labels ?? task.tags ?? []).includes(filters.label)) &&
          (!filters.parentTaskId ||
            task.parentTaskId === filters.parentTaskId) &&
          (!filters.executionMode ||
            task.executionMode === filters.executionMode),
      )
      .slice(0, 20);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] attempts=${task.attempts ?? 0}/${task.maxAttempts ?? 3}`,
          )
          .join("\n")
      : "No queued delegation tasks.";
  }

  if (trimmed.startsWith("/delegate group ")) {
    const group = trimmed.replace("/delegate group ", "").trim();
    if (!group) {
      return "Usage: /delegate group <group-name>";
    }
    const tasks = (await getEffectiveDelegationTasks(context.runtime)).filter(
      (task) => task.group === group,
    );
    return tasks.length
      ? tasks.map((task) => formatDelegationGroupTask(task)).join("\n\n")
      : `No delegation tasks found for group ${group}.`;
  }

  if (trimmed.startsWith("/delegate label ")) {
    const label = trimmed.replace("/delegate label ", "").trim();
    if (!label) {
      return "Usage: /delegate label <label>";
    }
    const tasks = (await getEffectiveDelegationTasks(context.runtime)).filter(
      (task) => (task.labels ?? task.tags ?? []).includes(label),
    );
    return tasks.length
      ? tasks
          .map((task: DelegationReadTask) => formatDelegationLabelTask(task))
          .join("\n\n")
      : `No delegation tasks found for label ${label}.`;
  }

  return undefined;
};
