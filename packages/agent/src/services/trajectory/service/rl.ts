import type { TrajectoryService } from "../service";
import {
  describeTrajectoryServiceRlExport,
  exportTrajectoryServiceRlDataset,
  exportTrajectoryServiceRlReady,
} from "../service-operations/rl";
import { getTrajectoryServiceState } from "./state";
import type { TrajectoryServiceApi } from "./types";

export const trajectoryServiceRlMethods: Pick<
  TrajectoryServiceApi,
  "exportRlReady" | "exportRlDataset" | "describeRlExport"
> = {
  exportRlReady(this: TrajectoryService, sessionId: string, options = {}) {
    return exportTrajectoryServiceRlReady(
      getTrajectoryServiceState(this).hosts,
      sessionId,
      options,
    );
  },

  exportRlDataset(this: TrajectoryService, options = {}) {
    return exportTrajectoryServiceRlDataset(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  describeRlExport(this: TrajectoryService) {
    return describeTrajectoryServiceRlExport(
      getTrajectoryServiceState(this).hosts,
    );
  },
};
