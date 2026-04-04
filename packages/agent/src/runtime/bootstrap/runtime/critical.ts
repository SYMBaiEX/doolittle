import { type AgentRuntime, stringToUuid } from "@elizaos/core";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";

export async function validateCriticalRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  appendBootstrapTrace("phase:rolodex:load:start");
  await runtime.getServiceLoadPromise("rolodex");
  appendBootstrapTrace("phase:rolodex:load:done");
  appendBootstrapTrace("phase:worldRooms:probe:start");
  await runtime.getRooms(stringToUuid(`world-${runtime.agentId}`));
  appendBootstrapTrace("phase:worldRooms:probe:done");
}
