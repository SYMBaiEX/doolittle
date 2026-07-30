import {
  describeTrajectoryBenchmarkManifest,
  describeTrajectoryBundle,
  listTrajectoryBenchmarkManifests,
  listTrajectoryBundles,
} from "./bundle-storage";

export function listTrajectoryEvaluationServiceBundles(
  baseDir: string,
  limit = 20,
) {
  return listTrajectoryBundles(baseDir, limit);
}

export function describeTrajectoryEvaluationServiceBundle(
  manifestPath: string,
) {
  return describeTrajectoryBundle(manifestPath);
}

export function listTrajectoryEvaluationServiceBenchmarkManifests(
  baseDir: string,
  limit = 20,
) {
  return listTrajectoryBenchmarkManifests(baseDir, limit);
}

export function describeTrajectoryEvaluationServiceBenchmarkManifest(
  manifestPath: string,
) {
  return describeTrajectoryBenchmarkManifest(manifestPath);
}
