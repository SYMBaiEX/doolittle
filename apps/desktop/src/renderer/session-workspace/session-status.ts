import type { BackendPhase } from "../../shared/contracts";
import type { DisplayMessage, RunReceiptStore } from "../chat/models";

export function sessionPanelStatus({
  sessionId,
  activeRequest,
  receipts,
  backendPhase,
  queuedCount = 0,
  queuePaused = false,
  messages = [],
}: {
  sessionId: string;
  activeRequest?: string;
  receipts: RunReceiptStore;
  backendPhase: BackendPhase;
  queuedCount?: number;
  queuePaused?: boolean;
  messages?: readonly DisplayMessage[];
}): string {
  if (activeRequest) {
    const run = receipts[activeRequest]?.latest.run;
    if (run?.pendingApprovals)
      return `Needs approval · ${run.pendingApprovals}`;
    if (run?.status === "waiting") return "Waiting";
    return backendPhase === "ready" ? "Running" : "Reconnecting";
  }
  if (queuedCount > 0) return queuePaused ? "Queue paused" : "Queued";
  const receipt = Object.values(receipts)
    .filter((value) => value.latest.sessionId === sessionId)
    .sort((left, right) =>
      right.latest.run.startedAt.localeCompare(left.latest.run.startedAt),
    )[0];
  if (receipt?.latest.run.status === "error" || messages.at(-1)?.error)
    return "Failed";
  if (receipt?.latest.run.status === "cancelled") return "Stopped";
  if (receipt?.latest.run.status === "complete") return "Complete";
  // Missing bounded run history is not evidence that a session completed.
  return backendPhase === "ready"
    ? "Ready"
    : backendPhase === "booting"
      ? "Connecting"
      : backendPhase === "degraded"
        ? "Needs attention"
        : "Offline";
}
