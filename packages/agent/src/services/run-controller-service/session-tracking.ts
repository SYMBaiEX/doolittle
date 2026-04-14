import type { RunControllerStore } from "@/services/run-controller/store";
import {
  actionCompletedTransition,
  actionStartedTransition,
  heartbeatTransition,
  messageTransition,
  pendingApprovalsTransition,
  streamTransition,
  thinkingTransition,
  waitingTransition,
} from "@/services/run-controller/transitions";
import type { RunSnapshot } from "@/services/run-controller/types";
import { applyRunTransition } from "./event-capture";
import type { RunControllerDependencies } from "./types";

export function updateThinking(
  dependencies: RunControllerDependencies,
  sessionId: string,
): void {
  applyRunTransition(dependencies, sessionId, thinkingTransition);
}

export function updateWaiting(
  dependencies: RunControllerDependencies,
  sessionId: string,
): void {
  applyRunTransition(dependencies, sessionId, waitingTransition);
}

export function noteMessage(
  dependencies: RunControllerDependencies,
  sessionId: string,
): void {
  applyRunTransition(dependencies, sessionId, messageTransition);
}

export function noteActionStarted(
  dependencies: RunControllerDependencies,
  sessionId: string,
  action: string,
): void {
  applyRunTransition(dependencies, sessionId, (current) =>
    actionStartedTransition(current, action),
  );
}

export function noteActionCompleted(
  dependencies: RunControllerDependencies,
  sessionId: string,
  action?: string,
): void {
  applyRunTransition(dependencies, sessionId, (current) =>
    actionCompletedTransition(current, action),
  );
}

export function noteStream(
  dependencies: RunControllerDependencies,
  sessionId: string,
  stream: string,
  detail?: string,
): void {
  applyRunTransition(dependencies, sessionId, (current) =>
    streamTransition(current, stream, detail),
  );
}

export function noteHeartbeat(
  dependencies: RunControllerDependencies,
  status: string,
  preview?: string,
  indicatorType?: string,
): void {
  const activeRuns = dependencies.store.list().filter((run) => !run.endedAt);
  if (activeRuns.length !== 1) {
    return;
  }
  const [run] = activeRuns;
  applyRunTransition(dependencies, run.sessionId, () =>
    heartbeatTransition(run, status, preview, indicatorType),
  );
}

export function setPendingApprovals(
  dependencies: RunControllerDependencies,
  sessionId: string,
  pendingApprovals: number,
): void {
  applyRunTransition(dependencies, sessionId, (current) =>
    pendingApprovalsTransition(current, pendingApprovals),
  );
}

export function getActiveRun(
  store: RunControllerStore,
  sessionId: string,
): RunSnapshot | undefined {
  return store.get(sessionId);
}

export function listActiveRuns(store: RunControllerStore): RunSnapshot[] {
  return store.list();
}
