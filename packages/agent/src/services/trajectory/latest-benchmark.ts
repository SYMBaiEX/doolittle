import type {
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
} from "../../types/trajectory";
import type { TrajectoryBenchmarkHost } from "./benchmark";
import { runTrajectoryBenchmark } from "./benchmark";

export function selectLatestTrajectoryBenchmarkManifest(
  manifests: TrajectoryBenchmarkManifest[],
): TrajectoryBenchmarkManifest | undefined {
  return manifests[0];
}

export async function runLatestTrajectoryBenchmark(
  host: TrajectoryBenchmarkHost,
  manifests: TrajectoryBenchmarkManifest[],
): Promise<TrajectoryBenchmarkRun | undefined> {
  const latest = selectLatestTrajectoryBenchmarkManifest(manifests);
  if (!latest) {
    return undefined;
  }
  return runTrajectoryBenchmark(host, latest.manifestPath);
}
