import type {
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
} from "../../../types/trajectory";
import {
  createTrajectoryBenchmarkManifest,
  describeTrajectoryBenchmarkEnvironment,
  runTrajectoryBenchmark,
} from "../benchmark";
import { runLatestTrajectoryBenchmark } from "../latest-ops";
import type { TrajectoryServiceHosts } from "../service-support";
import type { TrajectoryServiceBenchmarkManifestInput } from "../service-types";

export function describeTrajectoryServiceBenchmarkEnvironment(
  hosts: TrajectoryServiceHosts,
): TrajectoryBenchmarkEnvironmentSummary {
  return describeTrajectoryBenchmarkEnvironment(hosts.benchmark);
}

export function createTrajectoryServiceBenchmarkManifest(
  hosts: TrajectoryServiceHosts,
  input: TrajectoryServiceBenchmarkManifestInput,
): TrajectoryBenchmarkManifest {
  return createTrajectoryBenchmarkManifest(hosts.benchmark, input);
}

export async function runTrajectoryServiceBenchmark(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
): Promise<TrajectoryBenchmarkRun> {
  return runTrajectoryBenchmark(hosts.benchmark, manifestPath);
}

export async function runLatestTrajectoryServiceBenchmark(
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryBenchmarkRun | undefined> {
  return runLatestTrajectoryBenchmark(hosts);
}
