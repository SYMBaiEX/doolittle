import type { AgentExecutionContext } from "../../chat";
import { parseDelegationFilter } from "../delegation-command-parsers";

export interface DelegationReadTask {
  id: string;
  title: string;
  status: string;
  group?: string;
  profile?: string;
  priority?: string;
  labels?: string[];
  tags?: string[];
  parentTaskId?: string;
  childTaskIds?: string[];
  objective: string;
  workerPid?: number;
  attempts?: number;
  maxAttempts?: number;
  workerMode?: string;
  executionMode?: string;
  alive?: boolean;
  stalled?: boolean;
  attemptsRemaining?: number;
  durationMs?: number;
  lastOutputPath?: string;
}

export type DelegationReadHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined> | string | undefined;

export function parseDelegationReadFilter(trimmed: string, prefix: string) {
  const raw = trimmed === prefix ? "" : trimmed.replace(prefix, "").trim();
  return raw ? parseDelegationFilter(raw) : {};
}

export function formatDelegationListTask(task: DelegationReadTask): string {
  return `- ${task.id} ${task.title} [${task.status}] mode=${task.executionMode}/${task.workerMode ?? "inline"} group=${task.group ?? task.profile ?? "default"} priority=${task.priority ?? "normal"} profile=${task.profile ?? "default"} attempts=${task.attempts ?? 0}${task.workerPid ? ` pid=${task.workerPid}` : ""}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  parent=${task.parentTaskId ?? "root"} children=${task.childTaskIds?.length ?? 0}\n  ${task.objective}`;
}

export function formatDelegationGroupTask(task: DelegationReadTask): string {
  return `- ${task.id} ${task.title} [${task.status}] profile=${task.profile ?? "default"} labels=${task.labels?.join(",") || "none"}\n  ${task.objective}`;
}

export function formatDelegationLabelTask(task: DelegationReadTask): string {
  return `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"}\n  ${task.objective}`;
}

export function formatDelegationChildTask(task: DelegationReadTask): string {
  return `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"} parent=${task.parentTaskId ?? "root"}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  ${task.objective}`;
}

export function formatDelegationWorkerTask(task: DelegationReadTask): string {
  return `- ${task.id} [${task.status}] ${task.title}\n  pid=${task.workerPid ?? "none"} alive=${task.alive} stalled=${task.stalled} attempts=${task.attempts}/${task.maxAttempts} remaining=${task.attemptsRemaining}${task.durationMs !== undefined ? ` duration=${task.durationMs}ms` : ""}\n  profile=${task.profile ?? "default"} priority=${task.priority ?? "normal"} tags=${task.tags?.join(",") || "none"}\n  output=${task.lastOutputPath ?? "n/a"}`;
}
