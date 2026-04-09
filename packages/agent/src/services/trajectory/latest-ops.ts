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
import type { TrajectoryServiceHosts } from "./service-support";

export async function evaluateLatestTrajectoryBundle(
  hosts: TrajectoryServiceHosts,
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
  hosts: TrajectoryServiceHosts,
): TrajectoryReplayResult | undefined {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return replayTrajectoryBundle(hosts.bundleOperations, latest.manifestPath);
}

export function compressLatestTrajectoryBundle(
  hosts: TrajectoryServiceHosts,
): TrajectoryCompressionBundle | undefined {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return compressTrajectoryBundle(hosts.bundleOperations, latest.manifestPath);
}

export function compareLatestTrajectoryBundles(
  hosts: TrajectoryServiceHosts,
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
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryBenchmarkRun | undefined> {
  const latest = hosts.evaluation.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return runTrajectoryBenchmark(hosts.benchmark, latest.manifestPath);
}
