import type { DesktopExecutionAdmission } from "./execution-admission";
import type { WorkerHostRequest } from "./worker-host-rpc";

/** Compensate only the main-owned lease whose receipt the worker did not accept. */
export function releaseAbandonedExecutionClaim(
  admission: DesktopExecutionAdmission | undefined,
  botId: string,
  request: WorkerHostRequest,
  result: unknown,
): void {
  if (!admission || request.operation !== "execution.claim") return;
  const payload = request.payload as { runId?: unknown } | null;
  const decision = result as { accepted?: unknown; leaseId?: unknown } | null;
  if (
    typeof payload?.runId !== "string" ||
    decision?.accepted !== true ||
    typeof decision.leaseId !== "string"
  )
    return;
  admission.release({ botId, runId: payload.runId, leaseId: decision.leaseId });
}
