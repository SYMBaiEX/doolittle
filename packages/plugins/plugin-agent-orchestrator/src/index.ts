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

export function createAgentOrchestratorPlugin(
  options: AgentOrchestratorPluginOptions,
): Plugin {
  class AgentOrchestratorService extends ElizaService {
    static serviceType = "agent_orchestrator";
    capabilityDescription =
      "Agent orchestrator service backed by Eliza Agent delegation and worker supervision.";

    private readonly delegation = options.delegation;

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

    overview() {
      return this.delegation.overview();
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
