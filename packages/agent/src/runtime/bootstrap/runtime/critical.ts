import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import { type AgentRuntime, stringToUuid } from "@elizaos/core";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";

const CRITICAL_RUNTIME_SERVICES = [
  "rolodex",
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
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
