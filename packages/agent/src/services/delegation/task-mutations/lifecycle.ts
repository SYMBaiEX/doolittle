import type { DelegationTaskRecord } from "@/types";
import { nowIso } from "../utils";

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
