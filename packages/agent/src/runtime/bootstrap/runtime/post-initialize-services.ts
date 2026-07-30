import {
  DOOLITTLE_RUN_PROGRESS_SERVICE,
  DOOLITTLE_SDK_CAPABILITIES_SERVICE,
} from "@doolittle/contracts";
import { installDatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-persistence";
import type { AgentRuntime } from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";

/**
 * Completes configuration that requires an initialized runtime.
 *
 * Service registration belongs to plugin assembly. This phase only installs
 * the trajectory persistence bridge after the native trajectory service has
 * started, then waits for the official skills service before callers expose
 * the runtime.
 */
export async function finalizeCoreRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  await runtime.getServiceLoadPromise("trajectories");
  await installDatabaseTrajectoryLogger(runtime);
  await runtime.getServiceLoadPromise(AgentSkillsService.serviceType);
  await runtime.getServiceLoadPromise(DOOLITTLE_RUN_PROGRESS_SERVICE);
  await runtime.getServiceLoadPromise(DOOLITTLE_SDK_CAPABILITIES_SERVICE);
}
