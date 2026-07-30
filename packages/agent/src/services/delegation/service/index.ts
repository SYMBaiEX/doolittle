import type { IAgentRuntime } from "@elizaos/core";
import {
  type NativeAgentOrchestratorService,
  ORCHESTRATOR_TASK_SERVICE,
} from "@/runtime/native/service-bridge/runtime-contracts";
import type { DelegationTaskRecord } from "@/types";
import type { DelegationTaskFilter } from "../read-model";
import { matchDelegationTaskFilter } from "../read-model";
import {
  buildDelegationServiceAggregation,
  buildDelegationServiceOverview,
  buildDelegationServiceTree,
  buildDelegationServiceWorkers,
} from "../reporting";
import {
  buildDelegationUpdateEvent,
  type DelegationUpdateEvent,
} from "../utils";

/**
 * Synchronous read projection retained for legacy Doolittle renderers.
 *
 * This class has no store, worker paths, subprocesses, or supervisor. Canonical
 * task state lives in @elizaos/plugin-agent-orchestrator; async API/CLI paths
 * update this cache after reading that service.
 */
export class DelegationService {
  private runtime?: IAgentRuntime;
  private tasks: DelegationTaskRecord[] = [];
  private listeners = new Set<(event: DelegationUpdateEvent) => void>();
  private taskSubscriptions = new Map<string, () => void>();
  private taskRefreshes = new Map<string, Promise<void>>();

  bindRuntime(runtime: IAgentRuntime): void {
    if (this.runtime !== runtime) {
      this.clearTaskSubscriptions();
    }
    this.runtime = runtime;
    void this.refresh().catch(() => undefined);
  }

  async refresh(): Promise<DelegationTaskRecord[]> {
    if (!this.runtime) return this.tasks;
    const { getEffectiveDelegationTasks } = await import(
      "@/runtime/native/service-bridge/delegation"
    );
    const tasks = await getEffectiveDelegationTasks(this.runtime);
    this.replaceProjection(tasks);
    return this.list();
  }

  replaceProjection(tasks: readonly DelegationTaskRecord[]): void {
    const previous = new Map(this.tasks.map((task) => [task.id, task]));
    this.tasks = tasks.map((task) => structuredClone(task));
    this.reconcileTaskSubscriptions(this.tasks);
    for (const task of this.tasks) {
      const prior = previous.get(task.id);
      if (prior && JSON.stringify(prior) === JSON.stringify(task)) continue;
      this.emitProjectionUpdate(prior ? "updated" : "created", task);
    }
  }

  upsertProjection(task: DelegationTaskRecord): void {
    const index = this.tasks.findIndex((candidate) => candidate.id === task.id);
    const prior = index >= 0 ? this.tasks[index] : undefined;
    const next = structuredClone(task);
    if (prior && JSON.stringify(prior) === JSON.stringify(next)) return;
    if (index >= 0) {
      this.tasks[index] = next;
    } else {
      this.tasks.push(next);
    }
    this.subscribeToTask(task.id);
    this.emitProjectionUpdate(prior ? "updated" : "created", next);
  }

  list(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return this.tasks
      .filter((task) => matchDelegationTaskFilter(task, filter))
      .map((task) => structuredClone(task));
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

  get(id: string): DelegationTaskRecord {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`Delegation task not found: ${id}`);
    return structuredClone(task);
  }

  pending(filter?: DelegationTaskFilter): DelegationTaskRecord[] {
    return this.list(filter).filter((task) => task.status === "pending");
  }

  overview() {
    return buildDelegationServiceOverview(
      this.tasks,
      this.tasks.filter((task) => task.status === "running").length,
    );
  }

  workers(limit = 20, filter?: DelegationTaskFilter) {
    return buildDelegationServiceWorkers(this.tasks, limit, filter);
  }

  listChildren(parentTaskId: string): DelegationTaskRecord[] {
    return this.list({ parentTaskId });
  }

  tree(id: string) {
    return buildDelegationServiceTree(
      id,
      (taskId) => this.get(taskId),
      (parentId) => this.listChildren(parentId),
    );
  }

  aggregate(id: string) {
    return buildDelegationServiceAggregation(id, (taskId) => this.get(taskId));
  }

  queueSummary() {
    return this.overview();
  }

  onUpdate(listener: (event: DelegationUpdateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitProjectionUpdate(
    kind: "created" | "updated",
    task: DelegationTaskRecord,
  ): void {
    for (const listener of this.listeners) {
      listener(buildDelegationUpdateEvent(kind, structuredClone(task)));
    }
  }

  private reconcileTaskSubscriptions(
    tasks: readonly DelegationTaskRecord[],
  ): void {
    const taskIds = new Set(tasks.map((task) => task.id));
    for (const [taskId, unsubscribe] of this.taskSubscriptions) {
      if (taskIds.has(taskId)) continue;
      unsubscribe();
      this.taskSubscriptions.delete(taskId);
    }
    for (const taskId of taskIds) {
      this.subscribeToTask(taskId);
    }
  }

  private subscribeToTask(taskId: string): void {
    if (this.taskSubscriptions.has(taskId) || !this.runtime) return;
    const service = this.runtime.getService?.(
      ORCHESTRATOR_TASK_SERVICE,
    ) as NativeAgentOrchestratorService | null | undefined;
    const unsubscribe = service?.subscribeTaskChanges?.(taskId, () => {
      void this.refreshTask(taskId).catch(() => undefined);
    });
    if (unsubscribe) {
      this.taskSubscriptions.set(taskId, unsubscribe);
    }
  }

  private async refreshTask(taskId: string): Promise<void> {
    const active = this.taskRefreshes.get(taskId);
    if (active) return active;
    const refresh = (async () => {
      if (!this.runtime) return;
      const { getEffectiveDelegationTask } = await import(
        "@/runtime/native/service-bridge/delegation"
      );
      const task = await getEffectiveDelegationTask(
        this.runtime,
        undefined,
        taskId,
      );
      if (task) this.upsertProjection(task);
    })().finally(() => {
      this.taskRefreshes.delete(taskId);
    });
    this.taskRefreshes.set(taskId, refresh);
    return refresh;
  }

  private clearTaskSubscriptions(): void {
    for (const unsubscribe of this.taskSubscriptions.values()) {
      unsubscribe();
    }
    this.taskSubscriptions.clear();
  }
}
