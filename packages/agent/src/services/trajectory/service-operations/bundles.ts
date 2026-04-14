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
import type { TrajectoryServiceHosts } from "../service-support";
import type { TrajectoryServiceCompressBundleOptions } from "../service-types";

export function replayTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
): TrajectoryReplayResult {
  return replayTrajectoryBundle(hosts.bundleOperations, manifestPath);
}

export function replayLatestTrajectoryService(
  hosts: TrajectoryServiceHosts,
): TrajectoryReplayResult | undefined {
  return replayLatestTrajectoryBundle(hosts);
}

export function compressTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
  options: TrajectoryServiceCompressBundleOptions = {},
): TrajectoryCompressionBundle {
  return compressTrajectoryBundle(
    hosts.bundleOperations,
    manifestPath,
    options,
  );
}

export function compressLatestTrajectoryService(
  hosts: TrajectoryServiceHosts,
): TrajectoryCompressionBundle | undefined {
  return compressLatestTrajectoryBundle(hosts);
}

export function compareTrajectoryServiceBundles(
  hosts: TrajectoryServiceHosts,
  leftManifestPath: string,
  rightManifestPath: string,
): TrajectoryComparisonBundle {
  return compareTrajectoryBundles(
    hosts.bundleOperations,
    leftManifestPath,
    rightManifestPath,
  );
}

export function compareLatestTrajectoryServiceBundles(
  hosts: TrajectoryServiceHosts,
): TrajectoryComparisonBundle | undefined {
  return compareLatestTrajectoryBundles(hosts);
}
