import {
  getEffectiveDelegationChildren,
  getEffectiveDelegationOverview,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
} from "@/runtime/native/service-bridge/index";

import type { AgentExecutionContext } from "../chat";
import { parseDelegationFilter } from "./delegation-command-parsers";

export async function handleDelegationReadCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (
    trimmed === "/delegate" ||
    trimmed === "/delegate list" ||
    trimmed.startsWith("/delegate list ")
  ) {
    const raw =
      trimmed === "/delegate" || trimmed === "/delegate list"
        ? ""
        : trimmed.replace("/delegate list", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
    const nativeTasks = getEffectiveDelegationTasks(
      context.runtime,
      context.services,
    );
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
    const tasks = context.services.delegation
      .list({
        group: filters.group,
        profile: filters.profile,
        priority: filters.priority,
        label: filters.label,
        parentTaskId: filters.parentTaskId,
        status: filters.status,
        executionMode: filters.executionMode,
      })
      .slice(0, 20);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] mode=${task.executionMode}/${task.workerMode ?? "inline"} group=${task.group ?? task.profile ?? "default"} priority=${task.priority ?? "normal"} profile=${task.profile ?? "default"} attempts=${task.attempts ?? 0}${task.workerPid ? ` pid=${task.workerPid}` : ""}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  parent=${task.parentTaskId ?? "root"} children=${task.childTaskIds?.length ?? 0}\n  ${task.objective}`,
          )
          .join("\n")
      : "No delegation tasks recorded.";
  }

  if (trimmed === "/delegate overview") {
    return JSON.stringify(
      {
        local: getEffectiveDelegationOverview(
          context.runtime,
          context.services,
        ),
        native: getEffectiveDelegationQueue(context.runtime, context.services),
      },
      null,
      2,
    );
  }

  if (trimmed === "/delegate queue" || trimmed.startsWith("/delegate queue ")) {
    const nativeQueue = getEffectiveDelegationQueue(
      context.runtime,
      context.services,
    );
    if (trimmed === "/delegate queue" && nativeQueue) {
      return JSON.stringify(nativeQueue, null, 2);
    }
    const raw =
      trimmed === "/delegate queue"
        ? ""
        : trimmed.replace("/delegate queue", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
    const tasks = context.services.delegation
      .pending({
        group: filters.group,
        profile: filters.profile,
        priority: filters.priority,
        label: filters.label,
        parentTaskId: filters.parentTaskId,
        status: filters.status,
        executionMode: filters.executionMode,
      })
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
    const tasks = context.services.delegation.listByGroup(group);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] profile=${task.profile ?? "default"} labels=${task.labels?.join(",") || "none"}\n  ${task.objective}`,
          )
          .join("\n\n")
      : `No delegation tasks found for group ${group}.`;
  }

  if (trimmed.startsWith("/delegate label ")) {
    const label = trimmed.replace("/delegate label ", "").trim();
    if (!label) {
      return "Usage: /delegate label <label>";
    }
    const tasks = context.services.delegation.listByLabel(label);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"}\n  ${task.objective}`,
          )
          .join("\n\n")
      : `No delegation tasks found for label ${label}.`;
  }

  if (trimmed.startsWith("/delegate children ")) {
    const id = trimmed.replace("/delegate children ", "").trim();
    if (!id) {
      return "Usage: /delegate children <parent-id>";
    }
    const tasks = getEffectiveDelegationChildren(
      context.runtime,
      context.services,
      id,
    ) as Array<{
      id: string;
      title: string;
      status: string;
      group?: string;
      profile?: string;
      parentTaskId?: string;
      labels?: string[];
      tags?: string[];
      objective: string;
    }>;
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"} parent=${task.parentTaskId ?? "root"}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  ${task.objective}`,
          )
          .join("\n\n")
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

  if (
    trimmed === "/delegate workers" ||
    trimmed.startsWith("/delegate workers ")
  ) {
    const raw =
      trimmed === "/delegate workers"
        ? ""
        : trimmed.replace("/delegate workers", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
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
        ? tasks
            .map(
              (task) =>
                `- ${task.id} [${task.status}] ${task.title}\n  pid=${task.workerPid ?? "none"} alive=${task.alive} stalled=${task.stalled} attempts=${task.attempts}/${task.maxAttempts} remaining=${task.attemptsRemaining}${task.durationMs !== undefined ? ` duration=${task.durationMs}ms` : ""}\n  profile=${task.profile ?? "default"} priority=${task.priority ?? "normal"} tags=${task.tags?.join(",") || "none"}\n  output=${task.lastOutputPath ?? "n/a"}`,
            )
            .join("\n\n")
        : "No delegated worker tasks recorded.",
    ];
    return lines.join("\n");
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
}
