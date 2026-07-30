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
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type { TrajectoryEvaluationServiceBenchmarkManifestInput } from "../service-types";

export function describeTrajectoryEvaluationServiceBenchmarkEnvironment(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryBenchmarkEnvironmentSummary {
  return describeTrajectoryBenchmarkEnvironment(hosts.benchmark);
}

export function createTrajectoryEvaluationServiceBenchmarkManifest(
  hosts: TrajectoryEvaluationServiceHosts,
  input: TrajectoryEvaluationServiceBenchmarkManifestInput,
): TrajectoryBenchmarkManifest {
  return createTrajectoryBenchmarkManifest(hosts.benchmark, input);
}

export async function runTrajectoryEvaluationServiceBenchmark(
  hosts: TrajectoryEvaluationServiceHosts,
  manifestPath: string,
): Promise<TrajectoryBenchmarkRun> {
  return runTrajectoryBenchmark(hosts.benchmark, manifestPath);
}

export async function runLatestTrajectoryEvaluationServiceBenchmark(
  hosts: TrajectoryEvaluationServiceHosts,
): Promise<TrajectoryBenchmarkRun | undefined> {
  return runLatestTrajectoryBenchmark(hosts);
}
