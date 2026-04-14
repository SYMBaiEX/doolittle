import type {
  TrajectoryBenchmarkCaseInput,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryModelContext,
  TrajectoryReplayResult,
} from "../../../types/trajectory";

export interface TrajectoryBenchmarkEvaluationOptions {
  rubric?: string[];
  tags?: string[];
  replay?: TrajectoryReplayResult;
  prompt?: string;
  highlights?: string[];
  mode?: "dataset" | "research" | "evaluation" | "rl";
  purpose?: string;
}

export interface TrajectoryBenchmarkHost {
  baseDir: string;
  slug(value: string): string;
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  listBundles(limit: number): TrajectoryBundleEntry[];
  getModelContext?: () => TrajectoryModelContext;
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  evaluateBundle(
    manifestPath: string,
    options?: TrajectoryBenchmarkEvaluationOptions,
  ): Promise<TrajectoryEvaluationBundle>;
}

export interface TrajectoryBenchmarkManifestInput {
  label?: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  group?: string;
  cases: TrajectoryBenchmarkCaseInput[];
}
