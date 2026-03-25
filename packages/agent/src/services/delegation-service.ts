import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";

interface DelegationStore {
  tasks: DelegationTaskRecord[];
}

interface DelegationWorkerStatus {
  id: string;
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: DelegationTaskRecord["priority"];
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  childTaskIds?: string[];
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

export interface DelegationOverview {
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
  byProfile: Array<{ profile: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byGroup: Array<{ group: string; count: number }>;
  byLabel: Array<{ label: string; count: number }>;
  byOrchestration: Array<{ mode: DelegationOrchestrationMode; count: number }>;
}

interface DelegationTaskFilter {
  group?: string;
  profile?: string;
  priority?: DelegationTaskRecord["priority"];
  label?: string;
  parentTaskId?: string;
  status?: DelegationTaskRecord["status"];
  executionMode?: DelegationTaskRecord["executionMode"];
}

export interface DelegationTaskTree {
  task: DelegationTaskRecord;
  children: DelegationTaskTree[];
}

interface DelegationSpawnInput {
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

export interface DelegationAggregationItem {
  id: string;
  title: string;
  status: DelegationTaskRecord["status"];
  depth: number;
  executionMode: DelegationTaskRecord["executionMode"];
  orchestrationMode: DelegationOrchestrationMode;
  attempts: number;
  maxAttempts: number;
  lastNote?: string;
  lastOutputPath?: string;
}

export interface DelegationAggregationSummary {
  rootTaskId: string;
  orchestrationMode: DelegationOrchestrationMode;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  runningTasks: number;
  pendingTasks: number;
  completionRate: number;
  maxDepth: number;
  activeWorkers: number;
  stalledWorkers: number;
  leafTasks: number;
  completedOutputs: DelegationAggregationItem[];
  blockers: DelegationAggregationItem[];
}

export interface DelegationSupervisionReport {
  concurrency: number;
  started: string[];
  completed: string[];
  failed: { id: string; error: string }[];
  skipped: { id: string; reason: string }[];
  aggregations: DelegationAggregationSummary[];
  overview: DelegationOverview;
}

function resolveOrchestrationMode(
  mode?: DelegationOrchestrationMode,
  executionMode?: DelegationTaskRecord["executionMode"],
): DelegationOrchestrationMode {
  if (mode) {
    return mode;
  }
  return executionMode === "delegated" ? "parallel" : "sequential";
}

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(
  startedAt?: string,
  completedAt?: string,
): number | undefined {
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
  private readonly events = new EventEmitter();
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

  list(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return this.read()
      .tasks.filter((task) => this.matchesFilter(task, filter))
      .slice()
      .reverse();
  }

  create(input: {
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
    const store = this.read();
    const now = nowIso();
    const labels = this.normalizeLabels(input.labels ?? input.tags);
    const metadata = this.normalizeMetadata(input.metadata);
    const executionMode = input.executionMode ?? "local";
    const orchestrationMode = resolveOrchestrationMode(
      input.orchestrationMode,
      executionMode,
    );
    const task: DelegationTaskRecord = {
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
    store.tasks.push(task);
    if (input.parentTaskId) {
      const parent = store.tasks.find(
        (entry) => entry.id === input.parentTaskId,
      );
      if (parent) {
        parent.childTaskIds ??= [];
        parent.childTaskIds.push(task.id);
        parent.updatedAt = now;
        parent.notes.push(`system: spawned child task ${task.id}`);
      }
    }
    this.write(store);
    this.emitUpdate("created", task);
    return task;
  }

  spawnChild(
    parentId: string,
    input: DelegationSpawnInput,
  ): DelegationTaskRecord {
    const parent = this.get(parentId);
    return this.create({
      ...input,
      title: input.title || `${parent.title} child`,
      objective: input.objective,
      group: input.group ?? parent.group ?? parent.profile ?? parent.title,
      profile: input.profile ?? parent.profile,
      priority: input.priority ?? parent.priority ?? "normal",
      tags: this.mergeLists(parent.tags, input.tags),
      labels: this.mergeLists(
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
        resolveOrchestrationMode(undefined, input.executionMode ?? "delegated"),
      maxAttempts: input.maxAttempts,
    });
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

  pending(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return this.read()
      .tasks.filter((task) => this.matchesFilter(task, filter))
      .filter(
        (task) =>
          task.status === "pending" ||
          (task.status === "failed" &&
            (task.attempts ?? 0) < (task.maxAttempts ?? 3)),
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

  fail(
    id: string,
    note: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const failedTask = this.update(id, (task) => {
      task.status = "failed";
      task.workerPid = undefined;
      task.completedAt = nowIso();
      task.notes.push(note);
      task.notes.push(
        `system: failed after ${task.attempts ?? 0}/${task.maxAttempts ?? 3} attempts at ${task.completedAt}`,
      );
    });
    if (options?.cascadeChildren) {
      this.propagateChildNote(id, `system: parent task failed: ${note}`);
    }
    return failedTask;
  }

  cancel(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const cancelledTask = this.update(id, (task) => {
      task.status = "cancelled";
      task.workerPid = undefined;
      task.completedAt = nowIso();
      if (note) {
        task.notes.push(note);
      }
      task.notes.push(`system: cancelled at ${task.completedAt}`);
    });
    if (options?.cascadeChildren !== false) {
      for (const child of this.listChildren(id)) {
        this.cancel(
          child.id,
          note ?? `Cancelled because parent ${id} was cancelled.`,
          {
            cascadeChildren: true,
          },
        );
      }
    }
    return cancelledTask;
  }

  requeue(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const requeuedTask = this.update(id, (task) => {
      task.status = "pending";
      task.workerPid = undefined;
      task.workerMode =
        task.executionMode === "delegated" ? "process" : "inline";
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.lastOutputPath = undefined;
      if (note) {
        task.notes.push(note);
      }
      task.notes.push(
        `system: requeued with ${task.maxAttempts ?? 3} max attempts`,
      );
    });
    if (options?.cascadeChildren) {
      for (const child of this.listChildren(id)) {
        this.requeue(
          child.id,
          note ?? `Requeued because parent ${id} was requeued.`,
          {
            cascadeChildren: true,
          },
        );
      }
    }
    return requeuedTask;
  }

  overview(): DelegationOverview {
    const tasks = this.read().tasks;
    const profileCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    const labelCounts = new Map<string, number>();
    const orchestrationCounts = new Map<DelegationOrchestrationMode, number>();
    const counts = tasks.reduce<DelegationOverview>(
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
        if (task.profile) {
          profileCounts.set(
            task.profile,
            (profileCounts.get(task.profile) ?? 0) + 1,
          );
        }
        priorityCounts.set(
          task.priority ?? "normal",
          (priorityCounts.get(task.priority ?? "normal") ?? 0) + 1,
        );
        groupCounts.set(
          task.group ?? task.profile ?? "default",
          (groupCounts.get(task.group ?? task.profile ?? "default") ?? 0) + 1,
        );
        for (const label of task.labels ?? task.tags ?? []) {
          labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
        }
        const orchestrationMode = resolveOrchestrationMode(
          task.orchestrationMode,
          task.executionMode,
        );
        orchestrationCounts.set(
          orchestrationMode,
          (orchestrationCounts.get(orchestrationMode) ?? 0) + 1,
        );
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
        byProfile: [],
        byPriority: [],
        byGroup: [],
        byLabel: [],
        byOrchestration: [],
      },
    );

    counts.byProfile = Array.from(profileCounts.entries())
      .map(([profile, count]) => ({ profile, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.profile.localeCompare(right.profile),
      );
    counts.byPriority = Array.from(priorityCounts.entries())
      .map(([priority, count]) => ({ priority, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.priority.localeCompare(right.priority),
      );
    counts.byGroup = Array.from(groupCounts.entries())
      .map(([group, count]) => ({ group, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.group.localeCompare(right.group),
      );
    counts.byLabel = Array.from(labelCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      );
    counts.byOrchestration = Array.from(orchestrationCounts.entries())
      .map(([mode, count]) => ({ mode, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.mode.localeCompare(right.mode),
      );

    return counts;
  }

  workers(limit = 20, filter?: DelegationTaskFilter): DelegationWorkerStatus[] {
    return this.read()
      .tasks.filter((task) => this.matchesFilter(task, filter))
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
        const alive = task.workerPid
          ? this.isProcessAlive(task.workerPid)
          : false;
        const attemptsRemaining = Math.max(
          0,
          (task.maxAttempts ?? 3) - (task.attempts ?? 0),
        );
        return {
          id: task.id,
          title: task.title,
          objective: task.objective,
          group: task.group,
          profile: task.profile,
          priority: task.priority,
          tags: task.tags ?? [],
          labels: task.labels ?? task.tags ?? [],
          metadata: task.metadata ?? {},
          parentTaskId: task.parentTaskId,
          childTaskIds: task.childTaskIds ?? [],
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
      filter?: DelegationTaskFilter;
      onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
      onError?: (
        task: DelegationTaskRecord,
        error: string,
      ) => Promise<void> | void;
    },
  ): Promise<DelegationSupervisionReport> {
    const concurrency = Math.max(1, options?.concurrency ?? 2);
    const queue = this.pending(options?.filter);
    const skipped = this.read()
      .tasks.filter(
        (task) =>
          task.status === "pending" ||
          (task.status === "failed" &&
            (task.attempts ?? 0) < (task.maxAttempts ?? 3)),
      )
      .filter((task) => !this.matchesFilter(task, options?.filter))
      .map((task) => ({
        id: task.id,
        reason: "Filtered out by the current supervision selector.",
      }));
    const started: string[] = [];
    const completed: string[] = [];
    const failed: { id: string; error: string }[] = [];
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
          const message =
            error instanceof Error ? error.message : String(error);
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
    const startedRoots = started.filter((id) => {
      const task = this.get(id);
      return !task.parentTaskId || !started.includes(task.parentTaskId);
    });
    return {
      concurrency,
      started,
      completed,
      failed,
      skipped,
      aggregations: startedRoots.map((id) => this.aggregate(id)),
      overview,
    };
  }

  async executeQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: {
      concurrency?: number;
      filter?: DelegationTaskFilter;
      onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
    },
  ): Promise<DelegationTaskRecord[]> {
    const report = await this.superviseQueued(runner, options);
    return report.completed.map((id) => this.get(id));
  }

  queueSummary(): DelegationOverview {
    return this.overview();
  }

  supervise(
    runner: Parameters<DelegationService["superviseQueued"]>[0],
    options?: Parameters<DelegationService["superviseQueued"]>[1],
  ): Promise<DelegationSupervisionReport> {
    return this.superviseQueued(runner, options);
  }

  runQueued(
    runner: Parameters<DelegationService["executeQueued"]>[0],
    options?: Parameters<DelegationService["executeQueued"]>[1],
  ): Promise<DelegationTaskRecord[]> {
    return this.executeQueued(runner, options);
  }

  listByGroup(group: string): DelegationTaskRecord[] {
    return this.list({ group });
  }

  listByLabel(label: string): DelegationTaskRecord[] {
    return this.list({ label });
  }

  listByProfile(profile: string): DelegationTaskRecord[] {
    return this.list({ profile });
  }

  listChildren(parentTaskId: string): DelegationTaskRecord[] {
    return this.list({ parentTaskId });
  }

  tree(id: string): DelegationTaskTree {
    const task = this.get(id);
    return {
      task,
      children: this.listChildren(id).map((child) => this.tree(child.id)),
    };
  }

  aggregate(id: string): DelegationAggregationSummary {
    const root = this.get(id);
    const rows: Array<{ task: DelegationTaskRecord; depth: number }> = [];
    const visit = (taskId: string, depth: number): void => {
      const task = this.get(taskId);
      rows.push({ task, depth });
      for (const childId of task.childTaskIds ?? []) {
        visit(childId, depth + 1);
      }
    };
    visit(id, 0);

    const completedOutputs: DelegationAggregationItem[] = [];
    const blockers: DelegationAggregationItem[] = [];
    let completedTasks = 0;
    let failedTasks = 0;
    let cancelledTasks = 0;
    let runningTasks = 0;
    let pendingTasks = 0;
    let maxDepth = 0;
    let activeWorkers = 0;
    let stalledWorkers = 0;
    let leafTasks = 0;

    for (const { task, depth } of rows) {
      maxDepth = Math.max(maxDepth, depth);
      if ((task.childTaskIds ?? []).length === 0) {
        leafTasks += 1;
      }
      if (task.workerPid) {
        activeWorkers += 1;
        if (!this.isProcessAlive(task.workerPid)) {
          stalledWorkers += 1;
        }
      }

      const item: DelegationAggregationItem = {
        id: task.id,
        title: task.title,
        status: task.status,
        depth,
        executionMode: task.executionMode,
        orchestrationMode: resolveOrchestrationMode(
          task.orchestrationMode,
          task.executionMode,
        ),
        attempts: task.attempts ?? 0,
        maxAttempts: task.maxAttempts ?? 3,
        lastNote: task.notes.at(-1),
        lastOutputPath: task.lastOutputPath,
      };

      if (task.status === "completed") {
        completedTasks += 1;
        completedOutputs.push(item);
        continue;
      }
      if (task.status === "failed") {
        failedTasks += 1;
        blockers.push(item);
        continue;
      }
      if (task.status === "cancelled") {
        cancelledTasks += 1;
        blockers.push(item);
        continue;
      }
      if (task.status === "running") {
        runningTasks += 1;
        blockers.push(item);
        continue;
      }
      pendingTasks += 1;
      blockers.push(item);
    }

    return {
      rootTaskId: root.id,
      orchestrationMode: resolveOrchestrationMode(
        root.orchestrationMode,
        root.executionMode,
      ),
      totalTasks: rows.length,
      completedTasks,
      failedTasks,
      cancelledTasks,
      runningTasks,
      pendingTasks,
      completionRate:
        rows.length > 0 ? Number((completedTasks / rows.length).toFixed(3)) : 0,
      maxDepth,
      activeWorkers,
      stalledWorkers,
      leafTasks,
      completedOutputs,
      blockers,
    };
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
    this.emitUpdate("updated", task);
    return task;
  }

  onUpdate(
    listener: (event: {
      kind: "created" | "updated";
      taskId: string;
      status: DelegationTaskRecord["status"];
      detail: string;
    }) => void,
  ): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  private propagateChildNote(parentId: string, note: string): void {
    for (const child of this.listChildren(parentId)) {
      this.addNote(child.id, note);
    }
  }

  private matchesFilter(
    task: DelegationTaskRecord,
    filter?: DelegationTaskFilter,
  ): boolean {
    if (!filter) {
      return true;
    }
    if (
      filter.group &&
      (task.group ?? task.profile ?? "default") !== filter.group
    ) {
      return false;
    }
    if (filter.profile && task.profile !== filter.profile) {
      return false;
    }
    if (filter.priority && task.priority !== filter.priority) {
      return false;
    }
    if (filter.parentTaskId && task.parentTaskId !== filter.parentTaskId) {
      return false;
    }
    if (filter.status && task.status !== filter.status) {
      return false;
    }
    if (filter.executionMode && task.executionMode !== filter.executionMode) {
      return false;
    }
    if (filter.label) {
      const labels = task.labels ?? task.tags ?? [];
      if (!labels.includes(filter.label)) {
        return false;
      }
    }
    return true;
  }

  private normalizeLabels(labels?: string[]): string[] {
    return Array.from(
      new Set((labels ?? []).map((label) => label.trim()).filter(Boolean)),
    );
  }

  private normalizeMetadata(
    metadata?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    const normalized = Object.entries(metadata).reduce<Record<string, string>>(
      (accumulator, [key, value]) => {
        const normalizedKey = key.trim();
        const normalizedValue = value.trim();
        if (normalizedKey && normalizedValue) {
          accumulator[normalizedKey] = normalizedValue;
        }
        return accumulator;
      },
      {},
    );

    return Object.keys(normalized).length ? normalized : undefined;
  }

  private mergeLists(...lists: Array<string[] | undefined>): string[] {
    return Array.from(
      new Set(
        lists
          .flatMap((list) => list ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private read(): DelegationStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as DelegationStore;
  }

  private write(store: DelegationStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private emitUpdate(
    kind: "created" | "updated",
    task: DelegationTaskRecord,
  ): void {
    this.events.emit("update", {
      kind,
      taskId: task.id,
      status: task.status,
      detail: `${task.title} (${task.status})`,
    });
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
