import type { TrajectoryEvaluationService } from "../service";
import {
  describeTrajectoryEvaluationServiceRlExport,
  exportTrajectoryEvaluationServiceRlDataset,
  exportTrajectoryEvaluationServiceRlReady,
} from "../service-operations/rl";
import { getTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

export const trajectoryServiceRlMethods: Pick<
  TrajectoryEvaluationServiceApi,
  "exportRlReady" | "exportRlDataset" | "describeRlExport"
> = {
  exportRlReady(
    this: TrajectoryEvaluationService,
    sessionId: string,
    options = {},
  ) {
    return exportTrajectoryEvaluationServiceRlReady(
      getTrajectoryEvaluationServiceState(this).hosts,
      sessionId,
      options,
    );
  },

  exportRlDataset(this: TrajectoryEvaluationService, options = {}) {
    return exportTrajectoryEvaluationServiceRlDataset(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  describeRlExport(this: TrajectoryEvaluationService) {
    return describeTrajectoryEvaluationServiceRlExport(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },
};
