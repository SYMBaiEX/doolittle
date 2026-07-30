import type { TrajectoryEventJournal } from "../event-journal";
import type { TrajectoryEvaluationService } from "../service";
import type { TrajectoryEvaluationServiceHosts } from "../service-support";

interface TrajectoryEvaluationServiceState {
  baseDir: string;
  hosts: TrajectoryEvaluationServiceHosts;
  eventJournal: TrajectoryEventJournal;
}

const trajectoryServiceState = new WeakMap<
  TrajectoryEvaluationService,
  TrajectoryEvaluationServiceState
>();

export function setTrajectoryEvaluationServiceState(
  service: TrajectoryEvaluationService,
  state: TrajectoryEvaluationServiceState,
): void {
  trajectoryServiceState.set(service, state);
}

export function getTrajectoryEvaluationServiceState(
  service: TrajectoryEvaluationService,
): TrajectoryEvaluationServiceState {
  const state = trajectoryServiceState.get(service);
  if (!state) {
    throw new Error("Trajectory service state is unavailable");
  }
  return state;
}
