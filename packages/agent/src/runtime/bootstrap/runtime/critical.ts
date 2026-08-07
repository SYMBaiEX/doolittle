import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_CODING_AGENT_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
} from "@doolittle/contracts";
import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import { type AgentRuntime, PairingService, stringToUuid } from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import { PDF_SERVICE } from "@/runtime/native/service-bridge/runtime-contracts";

const CRITICAL_RUNTIME_SERVICES = [
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  "plugin_manager",
  "planning",
  "mcp",
  PairingService.serviceType,
  "memoryStorage",
  KNOWLEDGE_GRAPH_SERVICE,
  PDF_SERVICE,
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_CODING_AGENT_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
  AgentSkillsService.serviceType,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
  DOOLITTLE_AUTOMATION_SERVICE,
] as const;

export async function validateCriticalRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  for (const serviceType of CRITICAL_RUNTIME_SERVICES) {
    appendBootstrapTrace(`phase:${serviceType}:load:start`);
    await runtime.getServiceLoadPromise(serviceType);
    appendBootstrapTrace(`phase:${serviceType}:load:done`);
  }
  appendBootstrapTrace("phase:worldRooms:probe:start");
  await runtime.getRooms(stringToUuid(`world-${runtime.agentId}`));
  appendBootstrapTrace("phase:worldRooms:probe:done");
}
