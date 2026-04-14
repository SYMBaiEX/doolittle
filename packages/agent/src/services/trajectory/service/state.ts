import type { TrajectoryService } from "../service";
import type { TrajectoryServiceHosts } from "../service-support";

interface TrajectoryServiceState {
  baseDir: string;
  hosts: TrajectoryServiceHosts;
}

const trajectoryServiceState = new WeakMap<
  TrajectoryService,
  TrajectoryServiceState
>();

export function setTrajectoryServiceState(
  service: TrajectoryService,
  state: TrajectoryServiceState,
): void {
  trajectoryServiceState.set(service, state);
}

export function getTrajectoryServiceState(
  service: TrajectoryService,
): TrajectoryServiceState {
  const state = trajectoryServiceState.get(service);
  if (!state) {
    throw new Error("Trajectory service state is unavailable");
  }
  return state;
}
