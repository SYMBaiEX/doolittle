import type { Plugin } from "@elizaos/core";
import type { AgentOrchestratorPluginOptions } from "./contracts";
import { createAgentOrchestratorService } from "./service";

export function createAgentOrchestratorPlugin(
  options: AgentOrchestratorPluginOptions,
): Plugin {
  const AgentOrchestratorService = createAgentOrchestratorService(options);

  return {
    name: "agent-orchestrator",
    description: "Orchestrator plugin layered onto Doolittle delegation.",
    services: [AgentOrchestratorService],
  };
}
