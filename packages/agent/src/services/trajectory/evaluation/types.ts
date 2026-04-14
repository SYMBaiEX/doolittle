import type {
  TrajectoryBundleEntry,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryModelContext,
  TrajectoryReplayResult,
} from "../../../types/trajectory";

/** Subset of TrajectoryService the evaluation helpers need. */
export interface TrajectoryEvaluationHost {
  baseDir: string;
  slug(value: string): string;
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  listBundles(limit?: number): TrajectoryBundleEntry[];
  analyze(options?: TrajectoryExportOptions): {
    focus: "dataset" | "research" | "evaluation" | "rl";
    bundle: TrajectoryBundleEntry;
    replay: TrajectoryReplayResult;
    prompt: string;
    highlights: string[];
    purpose?: string;
    mode?: "dataset" | "research" | "evaluation" | "rl";
    tags?: string[];
  };
  getModelContext?: () => TrajectoryModelContext;
}

export interface EvaluateTrajectoryBundleOptions {
  rubric?: string[];
  tags?: string[];
  replay?: TrajectoryReplayResult;
  prompt?: string;
  highlights?: string[];
  mode?: "dataset" | "research" | "evaluation" | "rl";
  purpose?: string;
}

export interface ResolvedTrajectoryEvaluationInput {
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  focus: TrajectoryEvaluationBundle["focus"];
  purpose: string;
  reportTags: string[];
  prompt: string;
  highlights: string[];
}
