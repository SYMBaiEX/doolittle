import type { TrajectoryEvaluationService } from "../service";
import { getTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

export const trajectoryServiceRecordingMethods: Pick<
  TrajectoryEvaluationServiceApi,
  "recordEvent" | "recentEvents"
> = {
  recordEvent(this: TrajectoryEvaluationService, input) {
    return getTrajectoryEvaluationServiceState(this).eventJournal.append(input);
  },

  recentEvents(this: TrajectoryEvaluationService, limit = 100, filters = {}) {
    return getTrajectoryEvaluationServiceState(this).eventJournal.recent(
      limit,
      filters,
    );
  },
};
