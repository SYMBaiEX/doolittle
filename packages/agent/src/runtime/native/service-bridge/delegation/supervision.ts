import { TASK_SUPERVISOR_SERVICE_TYPE } from "@elizaos/plugin-agent-orchestrator";
import type { RuntimeLike } from "../runtime";
import { requireOfficialOrchestrator } from "./official";

/**
 * Compatibility result for Doolittle's former manual queue drain. The
 * installed plugin owns supervision through its exported supervisor service
 * type and TASKS actions; Doolittle must not start a second supervisor.
 */
export async function superviseEffectiveDelegationQueue(
  runtime: RuntimeLike,
  _services: unknown,
  _runner?: (task: unknown) => Promise<string>,
  _options?: Record<string, unknown>,
) {
  requireOfficialOrchestrator(runtime);
  return {
    available: false,
    delegated: true,
    owner: TASK_SUPERVISOR_SERVICE_TYPE,
    reason:
      "Manual Doolittle queue supervision was removed; the official orchestrator supervises task sessions.",
  };
}
