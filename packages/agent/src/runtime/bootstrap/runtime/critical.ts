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
  DOOLITTLE_SECRETS_VAULT_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
} from "@doolittle/contracts";
import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import {
  type AgentRuntime,
  AUTONOMY_SERVICE_TYPE,
  DocumentService,
  PairingService,
  PluginManagerService,
  RelationshipsService,
  SECRETS_SERVICE_TYPE,
  stringToUuid,
  TrajectoriesService,
} from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import { PDF_SERVICE } from "@/runtime/native/service-bridge/runtime-contracts";

// These advanced-capability service types are not public exports in Eliza 2.0.3-beta.7.
const EXPERIENCE_SERVICE_TYPE = "EXPERIENCE";
const CHARACTER_MANAGEMENT_SERVICE_TYPE = "CHARACTER_MANAGEMENT";
const PERSONALITY_STORE_SERVICE_TYPE = "PERSONALITY_STORE";

const CRITICAL_RUNTIME_SERVICES = [
  EXPERIENCE_SERVICE_TYPE,
  CHARACTER_MANAGEMENT_SERVICE_TYPE,
  PERSONALITY_STORE_SERVICE_TYPE,
  DocumentService.serviceType,
  RelationshipsService.serviceType,
  TrajectoriesService.serviceType,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  PluginManagerService.serviceType,
  "planning",
  "mcp",
  AUTONOMY_SERVICE_TYPE,
  PairingService.serviceType,
  SECRETS_SERVICE_TYPE,
  DOOLITTLE_SECRETS_VAULT_SERVICE,
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
