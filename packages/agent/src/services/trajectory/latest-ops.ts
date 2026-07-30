import type {
  TrajectoryBenchmarkRun,
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import { runTrajectoryBenchmark } from "./benchmark";
import {
  compareTrajectoryBundles,
  compressTrajectoryBundle,
  replayTrajectoryBundle,
} from "./bundle-ops";
import { evaluateBundle, normalizeEvaluationMode } from "./evaluation";
import type { TrajectoryEvaluationServiceHosts } from "./service-support";

export async function evaluateLatestTrajectoryBundle(
  hosts: TrajectoryEvaluationServiceHosts,
): Promise<TrajectoryEvaluationBundle | undefined> {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return evaluateBundle(hosts.evaluation, latest.manifestPath, {
    mode: normalizeEvaluationMode(latest.mode),
    purpose: latest.purpose ?? "trajectory evaluation",
    tags: latest.tags ?? [],
  });
}

export function replayLatestTrajectoryBundle(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryReplayResult | undefined {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return replayTrajectoryBundle(hosts.bundleOperations, latest.manifestPath);
}

export function compressLatestTrajectoryBundle(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryCompressionBundle | undefined {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return compressTrajectoryBundle(hosts.bundleOperations, latest.manifestPath);
}

export function compareLatestTrajectoryBundles(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryComparisonBundle | undefined {
  const latest = hosts.evaluation.listBundles(2);
  if (latest.length < 2) {
    return undefined;
  }
  const left = latest[1];
  const right = latest[0];
  if (!left || !right) {
    return undefined;
  }
  return compareTrajectoryBundles(
    hosts.bundleOperations,
    left.manifestPath,
    right.manifestPath,
  );
}

export async function runLatestTrajectoryBenchmark(
  hosts: TrajectoryEvaluationServiceHosts,
): Promise<TrajectoryBenchmarkRun | undefined> {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return runTrajectoryBenchmark(hosts.benchmark, latest.manifestPath);
}
