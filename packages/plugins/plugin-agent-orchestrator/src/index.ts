import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import type {
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationSupervisionReport,
  DelegationTaskTree,
} from "@/services/delegation-service";
import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";

type DelegationTaskLike = DelegationTaskRecord;
type DelegationQueueSummaryLike = DelegationOverview;
type DelegationTreeLike = DelegationTaskTree;
type DelegationSupervisionReportLike = DelegationSupervisionReport;

function normalizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }
  const normalized = Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value),
      ]),
  );
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizePriority(
  priority?: string,
): "low" | "normal" | "high" | undefined {
  return priority === "low" || priority === "high" || priority === "normal"
    ? priority
    : undefined;
}

function normalizeOrchestrationMode(
  mode?: string,
): DelegationOrchestrationMode | undefined {
  return mode === "sequential" || mode === "parallel" || mode === "hierarchical"
    ? mode
    : undefined;
}

function normalizeStringList(value?: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const list = value
      .map((entry) =>
        typeof entry === "string" ? entry.trim() : String(entry).trim(),
      )
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  if (typeof value === "string") {
    const list = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

function normalizePositiveInteger(value?: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : undefined;
}

export interface AgentOrchestratorPluginOptions {
  delegation: {
    create(input: {
      title: string;
      objective: string;
      metadata?: Record<string, string>;
      group?: string;
      profile?: string;
      priority?: "low" | "normal" | "high";
      labels?: string[];
      tags?: string[];
      parentTaskId?: string;
      executionMode?: "local" | "delegated";
      orchestrationMode?: DelegationOrchestrationMode;
      maxAttempts?: number;
    }): DelegationTaskLike;
    list(): DelegationTaskLike[];
    get(id: string): DelegationTaskLike;
    queueSummary(): DelegationQueueSummaryLike;
    overview(): DelegationOverview;
    getChildren?(id: string): DelegationTaskLike[];
    tree?(id: string): DelegationTreeLike;
    aggregate?(id: string): DelegationAggregationSummary;
    spawnChild(
      parentId: string,
      input: {
        title: string;
        objective: string;
        metadata?: Record<string, string>;
        profile?: string;
        priority?: "low" | "normal" | "high";
        tags?: string[];
        orchestrationMode?: DelegationOrchestrationMode;
      },
    ): DelegationTaskLike;
    retryTask?(
      id: string,
      note?: string,
      options?: { cascadeChildren?: boolean },
    ): DelegationTaskLike;
    cancel(id: string, note?: string): DelegationTaskLike;
    supervise(
      runner: (task: DelegationTaskLike) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<DelegationSupervisionReportLike>;
    runQueued(
      runner: (task: DelegationTaskLike) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<DelegationTaskLike[]>;
  };
}

function countPending(queue: DelegationQueueSummaryLike): number {
  return queue.pending ?? queue.total ?? 0;
}

function countActiveWorkers(queue: DelegationQueueSummaryLike): number {
  return queue.activeWorkers ?? 0;
}

export function createAgentOrchestratorPlugin(
  options: AgentOrchestratorPluginOptions,
): Plugin {
  class AgentOrchestratorService extends ElizaService {
    static serviceType = "agent_orchestrator";
    capabilityDescription =
      "Agent orchestrator service backed by Eliza Agent delegation and worker supervision.";

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
      runner: (task: DelegationTaskLike) => Promise<string>,
      runOptions?: Record<string, unknown>,
    ) {
      return this.delegation.supervise(runner, runOptions);
    }

    runQueued(
      runner: (task: DelegationTaskLike) => Promise<string>,
      runOptions?: Record<string, unknown>,
    ) {
      return this.delegation.runQueued(runner, runOptions);
    }
  }

  return {
    name: "agent-orchestrator",
    description: "Orchestrator plugin layered onto Eliza Agent delegation.",
    services: [AgentOrchestratorService],
  };
}

export default createAgentOrchestratorPlugin;
