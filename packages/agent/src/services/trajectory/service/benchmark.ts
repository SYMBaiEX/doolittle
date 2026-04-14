import { runLatestTrajectoryBenchmark } from "../latest-benchmark";
import type { TrajectoryService } from "../service";
import * as trajectoryCatalog from "../service-catalog";
import {
  createTrajectoryServiceBenchmarkManifest,
  describeTrajectoryServiceBenchmarkEnvironment,
  runTrajectoryServiceBenchmark,
} from "../service-operations/benchmark";
import { getTrajectoryServiceState } from "./state";
import type { TrajectoryServiceApi } from "./types";

export const trajectoryServiceBenchmarkMethods: Pick<
  TrajectoryServiceApi,
  | "describeBenchmarkEnvironment"
  | "createBenchmarkManifest"
  | "runBenchmark"
  | "runLatestBenchmark"
> = {
  describeBenchmarkEnvironment(this: TrajectoryService) {
    return describeTrajectoryServiceBenchmarkEnvironment(
      getTrajectoryServiceState(this).hosts,
    );
  },

  createBenchmarkManifest(this: TrajectoryService, input) {
    return createTrajectoryServiceBenchmarkManifest(
      getTrajectoryServiceState(this).hosts,
      input,
    );
  },

  runBenchmark(this: TrajectoryService, manifestPath: string) {
    return runTrajectoryServiceBenchmark(
      getTrajectoryServiceState(this).hosts,
      manifestPath,
    );
  },

  runLatestBenchmark(this: TrajectoryService) {
    const state = getTrajectoryServiceState(this);
    return runLatestTrajectoryBenchmark(
      state.hosts.benchmark,
      trajectoryCatalog.listTrajectoryServiceBenchmarkManifests(
        state.baseDir,
        20,
      ),
    );
  },
};
