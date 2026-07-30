import { executeEffectiveDelegationTask } from "@/runtime/native/service-bridge/delegation";
import type { DelegationTaskRecord } from "@/types";
import type { AgentExecutionContext } from "../chat";

/**
 * Compatibility adapter for older command/router call sites.
 *
 * Execution is owned by OrchestratorTaskService.spawnAgentForTask, which in
 * turn delegates process/session lifecycle to ACP_SUBPROCESS_SERVICE. No
 * Doolittle worker process or worker-result files are created.
 */
export async function runDelegationTaskInWorker(
  context: AgentExecutionContext,
  taskId: string,
  _options?: { assumeRunning?: boolean },
): Promise<DelegationTaskRecord> {
  const task = await executeEffectiveDelegationTask(
    context.runtime,
    context.services.delegationProjection,
    taskId,
  );
  if (!task) {
    throw new Error(`Delegation task not found: ${taskId}`);
  }
  return task;
}
