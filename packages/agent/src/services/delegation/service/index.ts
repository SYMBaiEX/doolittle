import type { IAgentRuntime } from "@elizaos/core";
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

  bindRuntime(runtime: IAgentRuntime): void {
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
    this.tasks = tasks.map((task) => structuredClone(task));
    for (const task of this.tasks) {
      for (const listener of this.listeners) {
        listener(buildDelegationUpdateEvent("updated", task));
      }
    }
  }

  upsertProjection(task: DelegationTaskRecord): void {
    this.replaceProjection([
      ...this.tasks.filter((candidate) => candidate.id !== task.id),
      task,
    ]);
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
}
