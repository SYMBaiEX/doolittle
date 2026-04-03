import type { IAgentRuntime, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import type {
  AgentOrchestratorDelegationTaskLike,
  AgentOrchestratorPluginOptions,
} from "./contracts";
import {
  normalizeMetadata,
  normalizeOrchestrationMode,
  normalizePositiveInteger,
  normalizePriority,
  normalizeStringList,
} from "./normalizers";
import { countActiveWorkers, countPending } from "./queue-metrics";

export function createAgentOrchestratorService(
  options: AgentOrchestratorPluginOptions,
) {
  return class AgentOrchestratorService extends ElizaService {
    static serviceType = "agent_orchestrator";
    capabilityDescription =
      "Agent orchestrator service backed by Doolittle delegation and worker supervision.";

    private readonly delegation = options.delegation;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new AgentOrchestratorService(runtime);
    }

    async stop(): Promise<void> {}

    createTask(
      title: string,
      objective: string,
      metadata?: Record<string, unknown>,
    ) {
      const normalizedMetadata = normalizeMetadata(metadata);
      return this.delegation.create({
        title,
        objective,
        metadata: normalizedMetadata,
        group:
          typeof metadata?.group === "string"
            ? metadata.group.trim()
            : undefined,
        profile:
          typeof metadata?.profile === "string"
            ? metadata.profile.trim()
            : undefined,
        priority: normalizePriority(
          typeof metadata?.priority === "string"
            ? metadata.priority
            : undefined,
        ),
        labels: normalizeStringList(metadata?.labels),
        tags:
          normalizeStringList(metadata?.tags) ??
          normalizeStringList(metadata?.labels),
        parentTaskId:
          typeof metadata?.parentTaskId === "string"
            ? metadata.parentTaskId.trim()
            : undefined,
        executionMode:
          metadata?.executionMode === "local" ||
          metadata?.executionMode === "delegated"
            ? metadata.executionMode
            : undefined,
        orchestrationMode: normalizeOrchestrationMode(
          typeof metadata?.orchestrationMode === "string"
            ? metadata.orchestrationMode
            : undefined,
        ),
        maxAttempts: normalizePositiveInteger(metadata?.maxAttempts),
      });
    }

    queue() {
      return this.delegation.queueSummary();
    }

    tasks() {
      return this.delegation.list();
    }

    getTask(id: string) {
      return this.delegation.get(id);
    }

    getChildren(id: string) {
      return this.delegation.getChildren?.(id) ?? [];
    }

    tree(id: string) {
      return this.delegation.tree?.(id) ?? this.delegation.get(id);
    }

    aggregate(id: string) {
      return this.delegation.aggregate?.(id);
    }

    overview() {
      return this.delegation.overview();
    }

    summary() {
      const tasks = this.delegation.list();
      const queue = this.delegation.queueSummary();
      return {
        tasks: Array.isArray(tasks) ? tasks.length : 0,
        queuePending: countPending(queue),
        activeWorkers: countActiveWorkers(queue),
        childTasksSupported: Boolean(this.delegation.getChildren),
        treeSupported: Boolean(this.delegation.tree),
        retrySupported: Boolean(this.delegation.retryTask),
      };
    }

    spawnChild(
      parentId: string,
      input: {
        title: string;
        objective: string;
        metadata?: Record<string, unknown>;
        profile?: string;
        priority?: string;
        tags?: string[];
        orchestrationMode?: string;
      },
    ) {
      return this.delegation.spawnChild(parentId, {
        ...input,
        metadata: normalizeMetadata(input.metadata),
        priority: normalizePriority(input.priority),
        orchestrationMode: normalizeOrchestrationMode(input.orchestrationMode),
      });
    }

    retryTask(
      id: string,
      note?: string,
      options?: { cascadeChildren?: boolean },
    ) {
      return this.delegation.retryTask?.(id, note, options);
    }

    cancelTask(id: string, note?: string) {
      return this.delegation.cancel(id, note);
    }

    supervise(
      runner: (task: AgentOrchestratorDelegationTaskLike) => Promise<string>,
      runOptions?: Record<string, unknown>,
    ) {
      return this.delegation.supervise(runner, runOptions);
    }

    runQueued(
      runner: (task: AgentOrchestratorDelegationTaskLike) => Promise<string>,
      runOptions?: Record<string, unknown>,
    ) {
      return this.delegation.runQueued(runner, runOptions);
    }
  };
}
