import type { TrajectoryEvaluationService } from "../service";
import * as trajectoryCatalog from "../service-catalog";
import { getTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

export const trajectoryServiceCatalogMethods: Pick<
  TrajectoryEvaluationServiceApi,
  | "listBundles"
  | "describeBundle"
  | "listBenchmarkManifests"
  | "describeBenchmarkManifest"
> = {
  listBundles(this: TrajectoryEvaluationService, limit = 20) {
    return trajectoryCatalog.listTrajectoryEvaluationServiceBundles(
      getTrajectoryEvaluationServiceState(this).baseDir,
      limit,
    );
  },

  describeBundle(this: TrajectoryEvaluationService, manifestPath: string) {
    return trajectoryCatalog.describeTrajectoryEvaluationServiceBundle(
      manifestPath,
    );
  },

  listBenchmarkManifests(this: TrajectoryEvaluationService, limit = 20) {
    return trajectoryCatalog.listTrajectoryEvaluationServiceBenchmarkManifests(
      getTrajectoryEvaluationServiceState(this).baseDir,
      limit,
    );
  },

  describeBenchmarkManifest(
    this: TrajectoryEvaluationService,
    manifestPath: string,
  ) {
    return trajectoryCatalog.describeTrajectoryEvaluationServiceBenchmarkManifest(
      manifestPath,
    );
  },
};
