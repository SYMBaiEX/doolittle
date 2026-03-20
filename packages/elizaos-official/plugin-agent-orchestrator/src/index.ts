import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

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
    queueSummary(): unknown;
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
  const AgentOrchestratorService = createServiceAdapter({
    serviceType: "agent_orchestrator",
    capabilityDescription:
      "Official-style agent orchestrator service backed by Eliza Agent delegation and worker supervision.",
    create: async () => ({
      createTask(
        title: string,
        objective: string,
        metadata?: Record<string, unknown>,
      ) {
        return options.delegation.create({ title, objective, metadata });
      },
      queue() {
        return options.delegation.queueSummary();
      },
      tasks() {
        return options.delegation.list();
      },
      supervise(
        runner: (task: unknown) => Promise<string>,
        runOptions?: Record<string, unknown>,
      ) {
        return options.delegation.supervise(runner, runOptions);
      },
      runQueued(
        runner: (task: unknown) => Promise<string>,
        runOptions?: Record<string, unknown>,
      ) {
        return options.delegation.runQueued(runner, runOptions);
      },
    }),
  });

  return createServicePlugin(
    "agent-orchestrator",
    "Official-style orchestrator plugin layered onto Eliza Agent task delegation.",
    AgentOrchestratorService,
  );
}

export default createAgentOrchestratorPlugin;
