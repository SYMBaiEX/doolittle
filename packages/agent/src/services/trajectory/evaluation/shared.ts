import {
  buildAnalysisPrompt,
  buildHighlights,
  normalizeEvaluationMode,
} from "../evaluation-heuristics";
import type {
  EvaluateTrajectoryBundleOptions,
  ResolvedTrajectoryEvaluationInput,
  TrajectoryEvaluationHost,
} from "./types";

export function resolveTrajectoryEvaluationInput(
  host: TrajectoryEvaluationHost,
  manifestPath: string,
  options: EvaluateTrajectoryBundleOptions = {},
): ResolvedTrajectoryEvaluationInput {
  const bundle = host.describeBundle(manifestPath);
  const replay = options.replay ?? host.replayBundle(manifestPath);
  const focus = normalizeEvaluationMode(options.mode ?? bundle.mode);
  const purpose = options.purpose ?? bundle.purpose ?? "trajectory evaluation";
  const reportTags = options.tags ?? bundle.tags ?? [];

  return {
    bundle,
    replay,
    focus,
    purpose,
    reportTags,
    prompt:
      options.prompt ??
      buildAnalysisPrompt(replay, {
        mode: focus,
        purpose,
        tags: reportTags,
        label: bundle.label,
      }),
    highlights: options.highlights ?? buildHighlights(replay),
  };
}
