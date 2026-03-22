import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface AgentOrchestratorPluginOptions {
  delegation: {
    create(input: {
      title: string;
      objective: string;
      metadata?: Record<string, unknown>;
      profile?: string;
      priority?: string;
      tags?: string[];
      parentTaskId?: string;
    }): unknown;
    list(): unknown[];
    get(id: string): unknown;
    queueSummary(): unknown;
    overview(): unknown;
    getChildren?(id: string): unknown[];
    tree?(id: string): unknown;
    spawnChild(
      parentId: string,
      input: {
        title: string;
        objective: string;
        metadata?: Record<string, unknown>;
        profile?: string;
        priority?: string;
        tags?: string[];
      },
    ): unknown;
    retryTask?(
      id: string,
      note?: string,
      options?: { cascadeChildren?: boolean },
    ): unknown;
    cancel(id: string, note?: string): unknown;
    supervise(
      runner: (task: unknown) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<unknown>;
    runQueued(
      runner: (task: unknown) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

function countPending(queue: unknown): number {
  if (Array.isArray(queue)) {
    return queue.length;
  }
  if (queue && typeof queue === "object") {
    const record = queue as Record<string, unknown>;
    if (typeof record.pending === "number") {
      return record.pending;
    }
    if (typeof record.total === "number") {
      return record.total;
    }
  }
  return 0;
}

function countActiveWorkers(queue: unknown): number {
  if (queue && typeof queue === "object") {
    const record = queue as Record<string, unknown>;
    if (typeof record.activeWorkers === "number") {
      return record.activeWorkers;
    }
  }
  return 0;
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
      return this.delegation.create({ title, objective, metadata });
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
      },
    ) {
      return this.delegation.spawnChild(parentId, input);
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
      runner: (task: unknown) => Promise<string>,
      runOptions?: Record<string, unknown>,
    ) {
      return this.delegation.supervise(runner, runOptions);
    }

    runQueued(
      runner: (task: unknown) => Promise<string>,
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
