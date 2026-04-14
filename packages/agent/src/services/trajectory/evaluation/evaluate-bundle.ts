import type { TrajectoryEvaluationBundle } from "../../../types/trajectory";
import { scoreReplay } from "../evaluation-heuristics";
import { requestTrajectoryModelText } from "../evaluation-model";
import { writeTrajectoryEvaluationArtifacts } from "../evaluation-persistence";
import { resolveTrajectoryEvaluationInput } from "./shared";
import type {
  EvaluateTrajectoryBundleOptions,
  TrajectoryEvaluationHost,
} from "./types";

export async function evaluateBundle(
  host: TrajectoryEvaluationHost,
  manifestPath: string,
  options: EvaluateTrajectoryBundleOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  const resolved = resolveTrajectoryEvaluationInput(
    host,
    manifestPath,
    options,
  );
  const heuristics = scoreReplay(
    resolved.replay,
    options.rubric ?? options.tags ?? [],
  );
  const response = await requestTrajectoryModelText(
    resolved.prompt,
    host.getModelContext?.(),
    {
      focus: resolved.focus,
      replay: resolved.replay,
      score: heuristics.score,
      findings: heuristics.findings,
      recommendations: heuristics.recommendations,
    },
  );
  const { evaluationPath, reportPath, responsePath } =
    writeTrajectoryEvaluationArtifacts({
      baseDir: host.baseDir,
      slug: host.slug,
      bundle: resolved.bundle,
      replay: resolved.replay,
      focus: resolved.focus,
      purpose: resolved.purpose,
      reportTags: resolved.reportTags,
      jsonTags: options.tags ?? [],
      rubric: options.rubric ?? [],
      highlights: resolved.highlights,
      prompt: resolved.prompt,
      score: heuristics.score,
      grade: heuristics.grade,
      findings: heuristics.findings,
      recommendations: heuristics.recommendations,
      response,
    });

  return {
    focus: resolved.focus,
    bundle: resolved.bundle,
    replay: resolved.replay,
    prompt: resolved.prompt,
    highlights: resolved.highlights,
    purpose: options.purpose ?? resolved.bundle.purpose,
    mode: resolved.focus,
    tags: options.tags ?? resolved.bundle.tags,
    score: heuristics.score,
    grade: heuristics.grade,
    findings: heuristics.findings,
    recommendations: heuristics.recommendations,
    evaluationPath,
    reportPath,
    response,
    responsePath,
  };
}
