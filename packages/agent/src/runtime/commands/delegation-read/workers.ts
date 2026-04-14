import {
  type DelegationReadHandler,
  formatDelegationWorkerTask,
  parseDelegationReadFilter,
} from "./shared";

export const handleDelegationWorkersRead: DelegationReadHandler = async (
  trimmed,
  context,
) => {
  if (
    trimmed !== "/delegate workers" &&
    !trimmed.startsWith("/delegate workers ")
  ) {
    return undefined;
  }

  const filters = parseDelegationReadFilter(trimmed, "/delegate workers");
  const overview = context.services.delegation.overview();
  const tasks = context.services.delegation.workers(20, {
    group: filters.group,
    profile: filters.profile,
    priority: filters.priority,
    label: filters.label,
    parentTaskId: filters.parentTaskId,
    status: filters.status,
    executionMode: filters.executionMode,
  });
  const lines = [
    `Workers: active=${overview.activeWorkers} alive=${overview.aliveWorkers} stalled=${overview.stalledWorkers} running=${overview.running} pending=${overview.pending} completed=${overview.completed} failed=${overview.failed}`,
    `Groups: ${overview.byGroup.map((entry) => `${entry.group}=${entry.count}`).join(", ") || "none"}`,
    `Labels: ${overview.byLabel.map((entry) => `${entry.label}=${entry.count}`).join(", ") || "none"}`,
    "",
    tasks.length
      ? tasks.map((task) => formatDelegationWorkerTask(task)).join("\n\n")
      : "No delegated worker tasks recorded.",
  ];
  return lines.join("\n");
};
