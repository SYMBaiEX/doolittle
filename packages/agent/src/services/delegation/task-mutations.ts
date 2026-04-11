import { randomUUID } from "node:crypto";
import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";
import { resolveDelegationOrchestrationMode } from "./read-model";
import {
  mergeDelegationLists,
  normalizeDelegationLabels,
  normalizeDelegationMetadata,
  nowIso,
} from "./utils";

export interface DelegationSpawnInput {
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: DelegationTaskRecord["priority"];
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  executionMode?: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  maxAttempts?: number;
}

export function createDelegationTaskRecord(input: {
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  executionMode?: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  maxAttempts?: number;
}): DelegationTaskRecord {
  const now = nowIso();
  const labels = normalizeDelegationLabels(input.labels ?? input.tags);
  const metadata = normalizeDelegationMetadata(input.metadata);
  const executionMode = input.executionMode ?? "local";
  const orchestrationMode = resolveDelegationOrchestrationMode(
    input.orchestrationMode,
    executionMode,
  );
  return {
    id: randomUUID(),
    title: input.title,
    objective: input.objective,
    group: input.group?.trim() || input.profile?.trim() || undefined,
    profile: input.profile?.trim() || undefined,
    priority: input.priority ?? "normal",
    tags: labels,
    labels,
    metadata,
    parentTaskId: input.parentTaskId,
    childTaskIds: [],
    status: "pending",
    executionMode,
    orchestrationMode,
    workerMode: executionMode === "delegated" ? "process" : "inline",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    notes: [`system: queued (${executionMode}/${orchestrationMode})`],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDelegationChildInput(
  parent: DelegationTaskRecord,
  input: DelegationSpawnInput,
): Parameters<typeof createDelegationTaskRecord>[0] {
  return {
    ...input,
    title: input.title || `${parent.title} child`,
    objective: input.objective,
    group: input.group ?? parent.group ?? parent.profile ?? parent.title,
    profile: input.profile ?? parent.profile,
    priority: input.priority ?? parent.priority ?? "normal",
    tags: mergeDelegationLists(parent.tags, input.tags),
    labels: mergeDelegationLists(
      parent.labels ?? parent.tags,
      input.labels ?? input.tags,
    ),
    metadata: {
      ...(parent.metadata ?? {}),
      ...(input.metadata ?? {}),
      parentTaskId: parent.id,
    },
    parentTaskId: parent.id,
    executionMode: input.executionMode ?? "delegated",
    orchestrationMode:
      input.orchestrationMode ??
      parent.orchestrationMode ??
      resolveDelegationOrchestrationMode(
        undefined,
        input.executionMode ?? "delegated",
      ),
    maxAttempts: input.maxAttempts,
  };
}

export function linkDelegationChildTask(
  tasks: DelegationTaskRecord[],
  parentTaskId: string | undefined,
  childTaskId: string,
  linkedAt: string,
): void {
  if (!parentTaskId) {
    return;
  }
  const parent = tasks.find((entry) => entry.id === parentTaskId);
  if (!parent) {
    return;
  }
  parent.childTaskIds ??= [];
  parent.childTaskIds.push(childTaskId);
  parent.updatedAt = linkedAt;
  parent.notes.push(`system: spawned child task ${childTaskId}`);
}

export function applyDelegationTaskRunning(task: DelegationTaskRecord): void {
  task.status = "running";
  task.startedAt = nowIso();
  task.attempts = (task.attempts ?? 0) + 1;
  task.notes.push(
    `system: running attempt ${task.attempts}/${task.maxAttempts ?? 3} at ${task.startedAt}`,
  );
}

export function applyDelegationWorkerStarted(
  task: DelegationTaskRecord,
  worker: { pid?: number; mode?: "inline" | "process"; outputPath?: string },
): void {
  task.workerPid = worker.pid;
  task.workerMode = worker.mode ?? task.workerMode ?? "process";
  if (worker.outputPath) {
    task.lastOutputPath = worker.outputPath;
  }
  task.notes.push(
    `system: worker started${worker.pid ? ` pid=${worker.pid}` : ""}${task.workerMode ? ` mode=${task.workerMode}` : ""}${worker.outputPath ? ` output=${worker.outputPath}` : ""}`,
  );
}

export function applyDelegationTaskCompletion(
  task: DelegationTaskRecord,
  note?: string,
): void {
  task.status = "completed";
  task.completedAt = nowIso();
  task.workerPid = undefined;
  if (note) {
    task.notes.push(note);
  }
  task.notes.push(`system: completed at ${task.completedAt}`);
}

export function applyDelegationTaskFailure(
  task: DelegationTaskRecord,
  note: string,
): void {
  task.status = "failed";
  task.workerPid = undefined;
  task.completedAt = nowIso();
  task.notes.push(note);
  task.notes.push(
    `system: failed after ${task.attempts ?? 0}/${task.maxAttempts ?? 3} attempts at ${task.completedAt}`,
  );
}

export function applyDelegationTaskCancellation(
  task: DelegationTaskRecord,
  note?: string,
): void {
  task.status = "cancelled";
  task.workerPid = undefined;
  task.completedAt = nowIso();
  if (note) {
    task.notes.push(note);
  }
  task.notes.push(`system: cancelled at ${task.completedAt}`);
}

export function applyDelegationTaskRequeue(
  task: DelegationTaskRecord,
  note?: string,
): void {
  task.status = "pending";
  task.workerPid = undefined;
  task.workerMode = task.executionMode === "delegated" ? "process" : "inline";
  task.startedAt = undefined;
  task.completedAt = undefined;
  task.lastOutputPath = undefined;
  if (note) {
    task.notes.push(note);
  }
  task.notes.push(
    `system: requeued with ${task.maxAttempts ?? 3} max attempts`,
  );
}
