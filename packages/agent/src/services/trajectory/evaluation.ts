import type {
  TrajectoryBundleEntry,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryModelContext,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
} from "../../types/trajectory";
import {
  buildAnalysisPrompt,
  buildHighlights,
  normalizeEvaluationMode,
  scoreReplay,
} from "./evaluation-heuristics";
import { requestTrajectoryModelText } from "./evaluation-model";
import {
  writeTrajectoryEvaluationArtifacts,
  writeTrajectoryResearchPackageArtifacts,
} from "./evaluation-persistence";

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

export {
  buildAnalysisPrompt,
  buildHighlights,
  normalizeEvaluationMode,
  scoreReplay,
} from "./evaluation-heuristics";

// ---------------------------------------------------------------------------
// Exported orchestration functions
// ---------------------------------------------------------------------------

export async function evaluateBundle(
  host: TrajectoryEvaluationHost,
  manifestPath: string,
  options: {
    rubric?: string[];
    tags?: string[];
    replay?: TrajectoryReplayResult;
    prompt?: string;
    highlights?: string[];
    mode?: "dataset" | "research" | "evaluation" | "rl";
    purpose?: string;
  } = {},
): Promise<TrajectoryEvaluationBundle> {
  const bundle = host.describeBundle(manifestPath);
  const replay = options.replay ?? host.replayBundle(manifestPath);
  const evaluationMode = normalizeEvaluationMode(options.mode ?? bundle.mode);
  const heuristics = scoreReplay(replay, options.rubric ?? options.tags ?? []);
  const reportPurpose =
    options.purpose ?? bundle.purpose ?? "trajectory evaluation";
  const reportTags = options.tags ?? bundle.tags ?? [];
  const prompt =
    options.prompt ??
    buildAnalysisPrompt(replay, {
      mode: evaluationMode,
      purpose: reportPurpose,
      tags: reportTags,
      label: bundle.label,
    });
  const response = await requestTrajectoryModelText(
    prompt,
    host.getModelContext?.(),
    {
      focus: evaluationMode,
      replay,
      score: heuristics.score,
      findings: heuristics.findings,
      recommendations: heuristics.recommendations,
    },
  );
  const { evaluationPath, reportPath, responsePath } =
    writeTrajectoryEvaluationArtifacts({
      baseDir: host.baseDir,
      slug: host.slug,
      bundle,
      replay,
      focus: evaluationMode,
      purpose: reportPurpose,
      reportTags,
      jsonTags: options.tags ?? [],
      rubric: options.rubric ?? [],
      highlights: options.highlights ?? [],
      prompt,
      score: heuristics.score,
      grade: heuristics.grade,
      findings: heuristics.findings,
      recommendations: heuristics.recommendations,
      response,
    });

  return {
    focus: evaluationMode,
    bundle,
    replay,
    prompt,
    highlights: options.highlights ?? buildHighlights(replay),
    purpose: options.purpose ?? bundle.purpose,
    mode: evaluationMode,
    tags: options.tags ?? bundle.tags,
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

export async function evaluate(
  host: TrajectoryEvaluationHost,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  const evaluationMode = normalizeEvaluationMode(options.mode);
  const analysis = host.analyze({
    ...options,
    mode: evaluationMode,
    purpose: options.purpose ?? "trajectory evaluation",
  });
  return evaluateBundle(host, analysis.bundle.manifestPath, {
    ...options,
    replay: analysis.replay,
    prompt: analysis.prompt,
    highlights: analysis.highlights,
    mode: evaluationMode,
    purpose: analysis.purpose,
    tags: analysis.tags,
  });
}

export async function packageBundle(
  host: TrajectoryEvaluationHost,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryResearchPackageBundle> {
  const analysis = host.analyze({
    ...options,
    limit: options.limit ?? 200,
    mode: options.mode ?? "research",
    purpose: options.purpose ?? "trajectory research package",
  });
  const evaluation = await evaluateBundle(host, analysis.bundle.manifestPath, {
    ...options,
    replay: analysis.replay,
    prompt: analysis.prompt,
    highlights: analysis.highlights,
    mode: normalizeEvaluationMode(options.mode ?? analysis.mode),
    purpose:
      analysis.purpose ?? options.purpose ?? "trajectory research package",
    tags: options.tags ?? analysis.tags,
    rubric: options.rubric,
  });
  const response = evaluation.response ?? evaluation.reportPath;
  const { packageManifestPath, reportPath, responsePath } =
    writeTrajectoryResearchPackageArtifacts({
      baseDir: host.baseDir,
      slug: host.slug,
      analysis,
      evaluation,
      response,
      purpose:
        analysis.purpose ?? options.purpose ?? "trajectory research package",
      mode: analysis.mode ?? options.mode ?? "research",
    });

  return {
    focus: evaluation.focus,
    bundle: analysis.bundle,
    replay: analysis.replay,
    analysis,
    evaluation,
    packageManifestPath,
    reportPath,
    response,
    responsePath,
    purpose: analysis.purpose,
    mode: analysis.mode,
    tags: analysis.tags,
  };
}

export async function packageLatest(
  host: TrajectoryEvaluationHost,
): Promise<TrajectoryResearchPackageBundle | undefined> {
  const latest = host.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return packageBundle(host, {
    limit: latest.limit,
    sessionId: latest.filters?.sessionId ?? undefined,
    role: latest.filters?.role ?? undefined,
    label: latest.label,
    purpose: latest.purpose,
    mode: latest.mode,
    tags: latest.tags,
    notes: latest.notes,
  });
}
