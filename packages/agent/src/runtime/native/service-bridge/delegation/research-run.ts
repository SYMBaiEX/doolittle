import type {
  NativeOrchestratorTaskDetail,
  NativeOrchestratorTaskStatus,
} from "../runtime-contracts";

type ResearchRunState =
  | "active"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ResearchRunReceipt = {
  runId: string;
  status: ResearchRunState;
  startedAt?: string;
  [key: string]: unknown;
};

const TERMINAL_TASK_STATUSES = new Set<NativeOrchestratorTaskStatus>([
  "done",
  "failed",
  "archived",
  "interrupted",
]);
const liveResearchRuns = new Map<string, AbortController>();

function runKey(taskId: string, runId: string) {
  return `${taskId}:${runId}`;
}

export function researchRunReceipt(
  metadata: Record<string, unknown>,
): ResearchRunReceipt | undefined {
  const value = metadata.researchRun;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.runId === "string" && typeof receipt.status === "string"
    ? (receipt as ResearchRunReceipt)
    : undefined;
}

export function isSessionlessResearchTask(task: NativeOrchestratorTaskDetail) {
  return (
    (task.kind === "research" ||
      task.metadata.capabilityProfile === "research" ||
      task.metadata.profile === "research") &&
    task.sessions.length === 0
  );
}

export function isCurrentActiveResearchRun(
  task: NativeOrchestratorTaskDetail,
  runId: string,
) {
  const receipt = researchRunReceipt(task.metadata);
  return (
    isSessionlessResearchTask(task) &&
    receipt?.runId === runId &&
    receipt.status === "active" &&
    !task.paused &&
    !TERMINAL_TASK_STATUSES.has(task.status)
  );
}

export function isLiveResearchRun(taskId: string, runId: string) {
  return liveResearchRuns.has(runKey(taskId, runId));
}

export function markResearchRunLive(taskId: string, runId: string) {
  const controller = new AbortController();
  liveResearchRuns.set(runKey(taskId, runId), controller);
  return controller.signal;
}

export function abortResearchRun(taskId: string, runId: string) {
  const controller = liveResearchRuns.get(runKey(taskId, runId));
  if (!controller) return false;
  controller.abort(
    new DOMException("The Doolittle research run was cancelled.", "AbortError"),
  );
  return true;
}

export function markResearchRunSettled(taskId: string, runId: string) {
  liveResearchRuns.delete(runKey(taskId, runId));
}
