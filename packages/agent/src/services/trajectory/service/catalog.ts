import type { TrajectoryService } from "../service";
import * as trajectoryCatalog from "../service-catalog";
import { getTrajectoryServiceState } from "./state";
import type { TrajectoryServiceApi } from "./types";

export const trajectoryServiceCatalogMethods: Pick<
  TrajectoryServiceApi,
  | "listBundles"
  | "describeBundle"
  | "listBenchmarkManifests"
  | "describeBenchmarkManifest"
> = {
  listBundles(this: TrajectoryService, limit = 20) {
    return trajectoryCatalog.listTrajectoryServiceBundles(
      getTrajectoryServiceState(this).baseDir,
      limit,
    );
  },

  describeBundle(this: TrajectoryService, manifestPath: string) {
    return trajectoryCatalog.describeTrajectoryServiceBundle(manifestPath);
  },

  listBenchmarkManifests(this: TrajectoryService, limit = 20) {
    return trajectoryCatalog.listTrajectoryServiceBenchmarkManifests(
      getTrajectoryServiceState(this).baseDir,
      limit,
    );
  },

  describeBenchmarkManifest(this: TrajectoryService, manifestPath: string) {
    return trajectoryCatalog.describeTrajectoryServiceBenchmarkManifest(
      manifestPath,
    );
  },
};
