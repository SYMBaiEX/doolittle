import {
  DOOLITTLE_RUN_PROGRESS_SERVICE,
  DOOLITTLE_SDK_CAPABILITIES_SERVICE,
} from "@doolittle/contracts";
import { installDatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-persistence";
import type { AgentRuntime } from "@elizaos/core";

/**
 * Completes configuration that requires an initialized runtime.
 *
 * Service registration and required-service validation belong to plugin
 * assembly and runtime initialization. This phase only installs the trajectory
 * persistence bridge, then waits for post-initialize observer services.
 */
export async function finalizeCoreRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  await runtime.getServiceLoadPromise("trajectories");
  await installDatabaseTrajectoryLogger(runtime);
  await runtime.getServiceLoadPromise(DOOLITTLE_RUN_PROGRESS_SERVICE);
  await runtime.getServiceLoadPromise(DOOLITTLE_SDK_CAPABILITIES_SERVICE);
}
