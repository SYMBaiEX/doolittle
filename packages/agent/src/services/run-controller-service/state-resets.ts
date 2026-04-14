import {
  createRunStartTransition,
  finishTransition,
} from "@/services/run-controller/transitions";
import type { StartTurnInput } from "@/services/run-controller/types";
import { cloneRun } from "@/services/run-controller/utils";
import { emitRunUpdate } from "./event-capture";
import type { FinishRunStatus, RunControllerDependencies } from "./types";

function finishExistingTurnIfNeeded(
  dependencies: RunControllerDependencies,
  sessionId: string,
): void {
  const existing = dependencies.store.getInternal(sessionId);
  if (!existing || existing.endedAt) {
    return;
  }
  finishTurn(dependencies, sessionId, "complete");
}

export function startTurn(
  dependencies: RunControllerDependencies,
  input: StartTurnInput,
) {
  finishExistingTurnIfNeeded(dependencies, input.sessionId);
  const transition = createRunStartTransition(input);
  dependencies.store.save(transition.run);
  emitRunUpdate(dependencies, transition.type, transition.run);
  return cloneRun(transition.run);
}

export function finishTurn(
  dependencies: RunControllerDependencies,
  sessionId: string,
  status: FinishRunStatus,
  errorMessage?: string,
): void {
  const run = dependencies.store.getInternal(sessionId);
  if (!run) {
    return;
  }
  if (
    run.endedAt &&
    run.status === status &&
    run.errorMessage === errorMessage
  ) {
    return;
  }
  const transition = finishTransition(run, status, errorMessage);
  dependencies.store.apply(sessionId, transition.run);
  emitRunUpdate(dependencies, transition.type, transition.run);
}
