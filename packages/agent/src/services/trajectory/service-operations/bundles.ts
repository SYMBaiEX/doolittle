import type {
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryReplayResult,
} from "../../../types/trajectory";
import {
  compareTrajectoryBundles,
  compressTrajectoryBundle,
  replayTrajectoryBundle,
} from "../bundle-ops";
import {
  compareLatestTrajectoryBundles,
  compressLatestTrajectoryBundle,
  replayLatestTrajectoryBundle,
} from "../latest-ops";
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type { TrajectoryEvaluationServiceCompressBundleOptions } from "../service-types";

export function replayTrajectoryEvaluationServiceBundle(
  hosts: TrajectoryEvaluationServiceHosts,
  manifestPath: string,
): TrajectoryReplayResult {
  return replayTrajectoryBundle(hosts.bundleOperations, manifestPath);
}

export function replayLatestTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryReplayResult | undefined {
  return replayLatestTrajectoryBundle(hosts);
}

export function compressTrajectoryEvaluationServiceBundle(
  hosts: TrajectoryEvaluationServiceHosts,
  manifestPath: string,
  options: TrajectoryEvaluationServiceCompressBundleOptions = {},
): TrajectoryCompressionBundle {
  return compressTrajectoryBundle(
    hosts.bundleOperations,
    manifestPath,
    options,
  );
}

export function compressLatestTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryCompressionBundle | undefined {
  return compressLatestTrajectoryBundle(hosts);
}

export function compareTrajectoryEvaluationServiceBundles(
  hosts: TrajectoryEvaluationServiceHosts,
  leftManifestPath: string,
  rightManifestPath: string,
): TrajectoryComparisonBundle {
  return compareTrajectoryBundles(
    hosts.bundleOperations,
    leftManifestPath,
    rightManifestPath,
  );
}

export function compareLatestTrajectoryEvaluationServiceBundles(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryComparisonBundle | undefined {
  return compareLatestTrajectoryBundles(hosts);
}
