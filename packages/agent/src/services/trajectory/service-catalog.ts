import {
  describeTrajectoryBenchmarkManifest,
  describeTrajectoryBundle,
  listTrajectoryBenchmarkManifests,
  listTrajectoryBundles,
} from "./bundle-storage";

export function listTrajectoryServiceBundles(baseDir: string, limit = 20) {
  return listTrajectoryBundles(baseDir, limit);
}

export function describeTrajectoryServiceBundle(manifestPath: string) {
  return describeTrajectoryBundle(manifestPath);
}

export function listTrajectoryServiceBenchmarkManifests(
  baseDir: string,
  limit = 20,
) {
  return listTrajectoryBenchmarkManifests(baseDir, limit);
}

export function describeTrajectoryServiceBenchmarkManifest(
  manifestPath: string,
) {
  return describeTrajectoryBenchmarkManifest(manifestPath);
}
