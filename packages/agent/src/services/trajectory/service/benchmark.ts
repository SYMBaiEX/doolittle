import { runLatestTrajectoryBenchmark } from "../latest-benchmark";
import type { TrajectoryEvaluationService } from "../service";
import * as trajectoryCatalog from "../service-catalog";
import {
  createTrajectoryEvaluationServiceBenchmarkManifest,
  describeTrajectoryEvaluationServiceBenchmarkEnvironment,
  runTrajectoryEvaluationServiceBenchmark,
} from "../service-operations/benchmark";
import { getTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

export const trajectoryServiceBenchmarkMethods: Pick<
  TrajectoryEvaluationServiceApi,
  | "describeBenchmarkEnvironment"
  | "createBenchmarkManifest"
  | "runBenchmark"
  | "runLatestBenchmark"
> = {
  describeBenchmarkEnvironment(this: TrajectoryEvaluationService) {
    return describeTrajectoryEvaluationServiceBenchmarkEnvironment(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  createBenchmarkManifest(this: TrajectoryEvaluationService, input) {
    return createTrajectoryEvaluationServiceBenchmarkManifest(
      getTrajectoryEvaluationServiceState(this).hosts,
      input,
    );
  },

  runBenchmark(this: TrajectoryEvaluationService, manifestPath: string) {
    return runTrajectoryEvaluationServiceBenchmark(
      getTrajectoryEvaluationServiceState(this).hosts,
      manifestPath,
    );
  },

  runLatestBenchmark(this: TrajectoryEvaluationService) {
    const state = getTrajectoryEvaluationServiceState(this);
    return runLatestTrajectoryBenchmark(
      state.hosts.benchmark,
      trajectoryCatalog.listTrajectoryEvaluationServiceBenchmarkManifests(
        state.baseDir,
        20,
      ),
    );
  },
};
