import {
  DOOLITTLE_RUN_PROGRESS_SERVICE,
  DOOLITTLE_SDK_CAPABILITIES_SERVICE,
} from "@doolittle/contracts";
import { installDatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-storage";
import type { AgentRuntime } from "@elizaos/core";
import { TrajectoriesService } from "@elizaos/plugin-assistant";
import { migrateLegacyAdvancedMemories } from "./legacy-advanced-memory";
import { PgliteMaintenanceService } from "./pglite-maintenance";
import { enforceTrajectoryCaptureBudget } from "./trajectory-capture-budget";

/**
 * Completes configuration that requires an initialized runtime.
 *
 * Service registration and required-service validation belong to plugin
 * assembly and runtime initialization. This phase installs the trajectory
 * persistence bridge and starts post-initialize runtime services.
 */
export async function finalizeCoreRuntimeServices(
  runtime: AgentRuntime,
  dataDir: string,
): Promise<void> {
  await migrateLegacyAdvancedMemories(runtime, dataDir);
  await runtime.getServiceLoadPromise(TrajectoriesService.serviceType);
  await installDatabaseTrajectoryLogger(runtime);
  await enforceTrajectoryCaptureBudget(runtime);
  await runtime.getServiceLoadPromise(PgliteMaintenanceService.serviceType);
  await runtime.getServiceLoadPromise(DOOLITTLE_RUN_PROGRESS_SERVICE);
  await runtime.getServiceLoadPromise(DOOLITTLE_SDK_CAPABILITIES_SERVICE);
}
