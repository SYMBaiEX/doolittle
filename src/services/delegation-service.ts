import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DelegationTaskRecord } from "@/types";

interface DelegationStore {
  tasks: DelegationTaskRecord[];
}

interface DelegationWorkerStatus {
  id: string;
  title: string;
  objective: string;
  status: DelegationTaskRecord["status"];
  executionMode: DelegationTaskRecord["executionMode"];
  workerMode: DelegationTaskRecord["workerMode"];
  workerPid?: number;
  attempts: number;
  attemptsRemaining: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  lastOutputPath?: string;
  alive: boolean;
  stalled: boolean;
  durationMs?: number;
  notesCount: number;
}

interface DelegationOverview {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  retryable: number;
  delegated: number;
  local: number;
  inlineWorkers: number;
  processWorkers: number;
  activeWorkers: number;
  aliveWorkers: number;
  stalledWorkers: number;
  concurrency: number;
}

interface DelegationSupervisionReport {
  concurrency: number;
  started: string[];
  completed: string[];
  failed: { id: string; error: string }[];
  skipped: { id: string; reason: string }[];
  overview: DelegationOverview;
}

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startedAt?: string, completedAt?: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }
  return Math.max(0, end - start);
}

export class DelegationService {
  private readonly filePath: string;
  private readonly workersDir: string;
  private activeExecutions = 0;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "delegation-tasks.json");
    this.workersDir = join(baseDir, "workers");
    mkdirSync(this.workersDir, { recursive: true });
    if (!existsSync(this.filePath)) {
      this.write({ tasks: [] });
    }
  }

  list(): DelegationTaskRecord[] {
    return this.read().tasks.slice().reverse();
  }

  create(input: {
    title: string;
    objective: string;
    executionMode?: "local" | "delegated";
    maxAttempts?: number;
  }): DelegationTaskRecord {
    const store = this.read();
    const now = nowIso();
    const task: DelegationTaskRecord = {
      id: randomUUID(),
      title: input.title,
      objective: input.objective,
      status: "pending",
      executionMode: input.executionMode ?? "local",
      workerMode: input.executionMode === "delegated" ? "process" : "inline",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      notes: [`system: queued (${input.executionMode ?? "local"})`],
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    this.write(store);
    return task;
  }

  addNote(id: string, note: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.notes.push(note);
    });
  }

  get(id: string): DelegationTaskRecord {
    const task = this.read().tasks.find((entry) => entry.id === id);
    if (!task) {
      throw new Error(`Delegation task not found: ${id}`);
    }
    return task;
  }

  pending(): DelegationTaskRecord[] {
    return this.read().tasks
      .filter(
        (task) =>
          task.status === "pending" ||
          (task.status === "failed" && (task.attempts ?? 0) < (task.maxAttempts ?? 3)),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  markRunning(id: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "running";
      task.startedAt = nowIso();
      task.attempts = (task.attempts ?? 0) + 1;
      task.notes.push(
        `system: running attempt ${task.attempts}/${task.maxAttempts ?? 3} at ${task.startedAt}`,
      );
    });
  }

  markWorkerStarted(
    id: string,
    worker: { pid?: number; mode?: "inline" | "process"; outputPath?: string },
  ): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.workerPid = worker.pid;
      task.workerMode = worker.mode ?? task.workerMode ?? "process";
      if (worker.outputPath) {
        task.lastOutputPath = worker.outputPath;
      }
      task.notes.push(
        `system: worker started${worker.pid ? ` pid=${worker.pid}` : ""}${task.workerMode ? ` mode=${task.workerMode}` : ""}${worker.outputPath ? ` output=${worker.outputPath}` : ""}`,
      );
    });
  }

  complete(id: string, note?: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "completed";
      task.completedAt = nowIso();
      task.workerPid = undefined;
      if (note) {
        task.notes.push(note);
      }
      task.notes.push(`system: completed at ${task.completedAt}`);
    });
  }

  fail(id: string, note: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "failed";
      task.workerPid = undefined;
      task.completedAt = nowIso();
      task.notes.push(note);
      task.notes.push(
        `system: failed after ${task.attempts ?? 0}/${task.maxAttempts ?? 3} attempts at ${task.completedAt}`,
      );
    });
  }

  cancel(id: string, note?: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "cancelled";
      task.workerPid = undefined;
      task.completedAt = nowIso();
      if (note) {
        task.notes.push(note);
      }
      task.notes.push(`system: cancelled at ${task.completedAt}`);
    });
  }

  requeue(id: string, note?: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "pending";
      task.workerPid = undefined;
      task.workerMode = task.executionMode === "delegated" ? "process" : "inline";
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.lastOutputPath = undefined;
      if (note) {
        task.notes.push(note);
      }
      task.notes.push(`system: requeued with ${task.maxAttempts ?? 3} max attempts`);
    });
  }

  overview(): DelegationOverview {
    const tasks = this.read().tasks;
    const counts = tasks.reduce(
      (acc, task) => {
        acc.total += 1;
        acc[task.status] += 1;
        acc[task.executionMode] += 1;
        if (task.workerMode === "inline") {
          acc.inlineWorkers += 1;
        }
        if (task.workerMode === "process") {
          acc.processWorkers += 1;
        }
        if (task.workerPid) {
          acc.activeWorkers += 1;
          if (this.isProcessAlive(task.workerPid)) {
            acc.aliveWorkers += 1;
          } else {
            acc.stalledWorkers += 1;
          }
        }
        if (
          task.status === "failed" &&
          (task.attempts ?? 0) < (task.maxAttempts ?? 3)
        ) {
          acc.retryable += 1;
        }
        return acc;
      },
      {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        retryable: 0,
        delegated: 0,
        local: 0,
        inlineWorkers: 0,
        processWorkers: 0,
        activeWorkers: 0,
        aliveWorkers: 0,
        stalledWorkers: 0,
        concurrency: this.activeExecutions,
      } satisfies DelegationOverview,
    );

    return counts;
  }

  workers(limit = 20): DelegationWorkerStatus[] {
    return this.read()
      .tasks
      .filter(
        (task) =>
          task.status === "running" ||
          task.workerPid !== undefined ||
          task.lastOutputPath !== undefined ||
          task.executionMode === "delegated",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((task) => {
        const alive = task.workerPid ? this.isProcessAlive(task.workerPid) : false;
        const attemptsRemaining = Math.max(0, (task.maxAttempts ?? 3) - (task.attempts ?? 0));
        return {
          id: task.id,
          title: task.title,
          objective: task.objective,
          status: task.status,
          executionMode: task.executionMode,
          workerMode: task.workerMode,
          workerPid: task.workerPid,
          attempts: task.attempts ?? 0,
          attemptsRemaining,
          maxAttempts: task.maxAttempts ?? 3,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          lastOutputPath: task.lastOutputPath,
          alive,
          stalled: Boolean(task.workerPid && !alive),
          durationMs: durationMs(task.startedAt, task.completedAt),
          notesCount: task.notes.length,
        };
      });
  }

  async superviseQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: {
      concurrency?: number;
      onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
      onError?: (task: DelegationTaskRecord, error: string) => Promise<void> | void;
    },
  ): Promise<DelegationSupervisionReport> {
    const concurrency = Math.max(1, options?.concurrency ?? 2);
    const queue = this.pending();
    const started: string[] = [];
    const completed: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const inflight = new Set<Promise<void>>();

    const launchTask = (task: DelegationTaskRecord): Promise<void> => {
      const job = (async () => {
        try {
          const runningTask = this.markRunning(task.id);
          started.push(runningTask.id);
          const result = await runner(runningTask);
          const completedTask = this.complete(task.id, result);
          completed.push(completedTask.id);
          await options?.onComplete?.(completedTask);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ id: task.id, error: message });
          const failedTask = this.fail(task.id, message);
          await options?.onError?.(failedTask, message);
        }
      })().finally(() => {
        inflight.delete(job);
        this.activeExecutions = Math.max(0, this.activeExecutions - 1);
      });

      inflight.add(job);
      this.activeExecutions += 1;
      return job;
    };

    for (const task of queue) {
      while (inflight.size >= concurrency) {
        await Promise.race(inflight);
      }
      launchTask(task);
    }

    while (inflight.size > 0) {
      await Promise.race(inflight);
    }

    const overview = this.overview();
    return {
      concurrency,
      started,
      completed,
      failed,
      skipped,
      overview,
    };
  }

  async executeQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: { concurrency?: number; onComplete?: (task: DelegationTaskRecord) => Promise<void> | void },
  ): Promise<DelegationTaskRecord[]> {
    const report = await this.superviseQueued(runner, options);
    return report.completed.map((id) => this.get(id));
  }

  private update(
    id: string,
    mutate: (task: DelegationTaskRecord) => void,
  ): DelegationTaskRecord {
    const store = this.read();
    const task = store.tasks.find((entry) => entry.id === id);
    if (!task) {
      throw new Error(`Delegation task not found: ${id}`);
    }
    mutate(task);
    task.updatedAt = new Date().toISOString();
    this.write(store);
    return task;
  }

  private read(): DelegationStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as DelegationStore;
  }

  private write(store: DelegationStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  getWorkerPaths(id: string): { inputPath: string; outputPath: string } {
    return {
      inputPath: join(this.workersDir, `${id}-input.json`),
      outputPath: join(this.workersDir, `${id}-output.json`),
    };
  }

  private isProcessAlive(pid?: number): boolean {
    if (!pid || pid <= 0) {
      return false;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
