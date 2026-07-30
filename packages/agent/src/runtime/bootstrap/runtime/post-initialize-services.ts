import { installDatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-persistence";
import type { AgentRuntime } from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";

/**
 * Completes configuration that requires an initialized runtime.
 *
 * Service registration belongs to plugin assembly. This phase only installs
 * the trajectory persistence bridge and waits for the official skills service
 * to finish loading before callers expose the runtime.
 */
export async function finalizeCoreRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  await installDatabaseTrajectoryLogger(runtime);
  await runtime.getServiceLoadPromise(AgentSkillsService.serviceType);
}
