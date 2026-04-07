import { EventEmitter } from "node:events";

import type { DelegationTaskRecord } from "@/types";
import {
  cascadeDelegationDescendants,
  propagateDelegationChildNotes,
} from "./child-propagation";
import {
  addDelegationTaskNote,
  createDelegationTask,
  getDelegationTask,
  listDelegationChildren,
  listDelegationTasks,
  listPendingDelegationTasksForStore,
  spawnDelegationChildTask,
} from "./crud";
import {
  cancelDelegationTask,
  completeDelegationTask,
  failDelegationTask,
  markDelegationTaskRunning,
  markDelegationWorkerStarted,
  requeueDelegationTask,
} from "./lifecycle";
import { buildDelegationSkippedTasks } from "./queue";
import type {
  DelegationTaskFilter,
  DelegationTaskTree,
  DelegationWorkerStatus,
} from "./read-model";
import {
  buildDelegationServiceAggregation,
  buildDelegationServiceOverview,
  buildDelegationServiceTree,
  buildDelegationServiceWorkers,
} from "./reporting";
import type {
  DelegationCreateInput,
  DelegationExecutionOptions,
  DelegationMutationContext,
  DelegationSupervisionOptions,
  DelegationSupervisionReport,
  DelegationWorkerStartInput,
} from "./service-types";
import { DelegationTaskStore } from "./storage";
import { superviseDelegationQueue } from "./supervision";
import {
  buildDelegationUpdateEvent,
  type DelegationUpdateEvent,
} from "./utils";

export type {
  DelegationAggregationItem,
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
  DelegationTaskTree,
  DelegationWorkerStatus,
} from "./read-model";
export type { DelegationSupervisionReport } from "./service-types";

export class DelegationService {
  private readonly store: DelegationTaskStore;
  private readonly events = new EventEmitter();
  private activeExecutions = 0;

  constructor(baseDir: string) {
    this.store = new DelegationTaskStore(baseDir);
  }

  list(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return listDelegationTasks(this.read().tasks, filter);
  }

  create(input: DelegationCreateInput): DelegationTaskRecord {
    return createDelegationTask(this.mutationContext(), input);
  }

  spawnChild(
    parentId: string,
    input: Omit<DelegationCreateInput, "parentTaskId">,
  ): DelegationTaskRecord {
    return spawnDelegationChildTask(this.mutationContext(), parentId, input);
  }

  addNote(id: string, note: string): DelegationTaskRecord {
    return addDelegationTaskNote(this.mutationContext(), id, note);
  }

  get(id: string): DelegationTaskRecord {
    return getDelegationTask(this.read().tasks, id);
  }

  pending(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return listPendingDelegationTasksForStore(this.read().tasks, filter);
  }

  markRunning(id: string): DelegationTaskRecord {
    return markDelegationTaskRunning(this.mutationContext(), id);
  }

  markWorkerStarted(
    id: string,
    worker: DelegationWorkerStartInput,
  ): DelegationTaskRecord {
    return markDelegationWorkerStarted(this.mutationContext(), id, worker);
  }

  complete(id: string, note?: string): DelegationTaskRecord {
    return completeDelegationTask(this.mutationContext(), id, note);
  }

  fail(
    id: string,
    note: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const failedTask = failDelegationTask(this.mutationContext(), id, note);
    if (options?.cascadeChildren) {
      propagateDelegationChildNotes(
        id,
        `system: parent task failed: ${note}`,
        (parentTaskId) => this.listChildren(parentTaskId),
        (noteId, childNote) => this.addNote(noteId, childNote),
      );
    }
    return failedTask;
  }

  cancel(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const cancelledTask = cancelDelegationTask(
      this.mutationContext(),
      id,
      note,
    );
    if (options?.cascadeChildren !== false) {
      cascadeDelegationDescendants(
        id,
        (parentTaskId) => this.listChildren(parentTaskId),
        (child, parentTaskId) => {
          this.cancel(
            child.id,
            note ?? `Cancelled because parent ${parentTaskId} was cancelled.`,
            {
              cascadeChildren: false,
            },
          );
        },
      );
    }
    return cancelledTask;
  }

  requeue(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord {
    const requeuedTask = requeueDelegationTask(
      this.mutationContext(),
      id,
      note,
    );
    if (options?.cascadeChildren) {
      cascadeDelegationDescendants(
        id,
        (parentTaskId) => this.listChildren(parentTaskId),
        (child, parentTaskId) => {
          this.requeue(
            child.id,
            note ?? `Requeued because parent ${parentTaskId} was requeued.`,
            {
              cascadeChildren: false,
            },
          );
        },
      );
    }
    return requeuedTask;
  }

  overview() {
    return buildDelegationServiceOverview(
      this.read().tasks,
      this.activeExecutions,
    );
  }

  workers(limit = 20, filter?: DelegationTaskFilter): DelegationWorkerStatus[] {
    return buildDelegationServiceWorkers(this.read().tasks, limit, filter);
  }

  async superviseQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: DelegationSupervisionOptions,
  ): Promise<DelegationSupervisionReport> {
    const concurrency = Math.max(1, options?.concurrency ?? 2);
    const queue = this.pending(options?.filter);
    const skipped = buildDelegationSkippedTasks(
      this.read().tasks,
      options?.filter,
    );
    return superviseDelegationQueue({
      queue,
      skipped,
      concurrency,
      markRunning: this.markRunning.bind(this),
      complete: this.complete.bind(this),
      fail: this.fail.bind(this),
      get: this.get.bind(this),
      aggregate: this.aggregate.bind(this),
      overview: this.overview.bind(this),
      onExecutionDelta: (delta) => {
        this.activeExecutions = Math.max(0, this.activeExecutions + delta);
      },
      runner,
      onComplete: options?.onComplete,
      onError: options?.onError,
    });
  }

  async executeQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: DelegationExecutionOptions,
  ): Promise<DelegationTaskRecord[]> {
    const report = await this.superviseQueued(runner, options);
    return report.completed.map((id) => this.get(id));
  }

  queueSummary() {
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
    return listDelegationChildren(this.read().tasks, parentTaskId);
  }

  tree(id: string): DelegationTaskTree {
    return buildDelegationServiceTree(
      id,
      (taskId) => this.get(taskId),
      (taskId) => this.listChildren(taskId),
    );
  }

  aggregate(id: string) {
    return buildDelegationServiceAggregation(id, (taskId) => this.get(taskId));
  }

  onUpdate(listener: (event: DelegationUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  getWorkerPaths(id: string): { inputPath: string; outputPath: string } {
    return this.store.getWorkerPaths(id);
  }

  private mutationContext(): DelegationMutationContext {
    return {
      read: () => this.read(),
      write: (store) => this.write(store),
      emitUpdate: (kind, task) => this.emitUpdate(kind, task),
    };
  }

  private read() {
    return this.store.read();
  }

  private write(store: ReturnType<DelegationTaskStore["read"]>): void {
    this.store.write(store);
  }

  private emitUpdate(
    kind: "created" | "updated",
    task: DelegationTaskRecord,
  ): void {
    this.events.emit("update", buildDelegationUpdateEvent(kind, task));
  }
}
