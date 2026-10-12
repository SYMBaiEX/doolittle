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
  baseDir: string,
  manifestPath: string,
) {
  return describeTrajectoryBundle(baseDir, manifestPath);
}

export function listTrajectoryEvaluationServiceBenchmarkManifests(
  baseDir: string,
  limit = 20,
) {
  return listTrajectoryBenchmarkManifests(baseDir, limit);
}

export function describeTrajectoryEvaluationServiceBenchmarkManifest(
  baseDir: string,
  manifestPath: string,
) {
  return describeTrajectoryBenchmarkManifest(baseDir, manifestPath);
}
