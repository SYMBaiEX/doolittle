import type {
  TrajectoryBenchmarkCase,
  TrajectoryBenchmarkCaseResult,
  TrajectoryBenchmarkManifest,
} from "../../../../types/trajectory";
import type { TrajectoryBenchmarkHost } from "../types";

export async function runTrajectoryBenchmarkCases(
  host: TrajectoryBenchmarkHost,
  manifest: TrajectoryBenchmarkManifest,
): Promise<TrajectoryBenchmarkCaseResult[]> {
  const cases: TrajectoryBenchmarkCaseResult[] = [];

  for (const [index, entry] of manifest.cases.entries()) {
    const replay = host.replayBundle(entry.manifestPath);
    const evaluation = await host.evaluateBundle(entry.manifestPath, {
      rubric: entry.rubric ?? manifest.rubric,
      tags: entry.tags ?? manifest.tags,
      mode: entry.mode ?? "evaluation",
      purpose: entry.purpose ?? manifest.purpose,
      replay,
    });
    const comparison =
      index > 0
        ? host.compareBundles(
            manifest.cases[0]?.manifestPath ?? entry.manifestPath,
            entry.manifestPath,
          )
        : undefined;

    cases.push({
      case: entry as TrajectoryBenchmarkCase,
      replay,
      evaluation,
      comparison,
    });
  }

  return cases;
}
