import type {
  TrajectoryAnalysisBundle,
  TrajectoryBundleEntry,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "../../types/trajectory";

export interface BuildTrajectoryEvaluationSnapshotInput {
  createdAt: string;
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  score: number;
  grade: TrajectoryEvaluationBundle["grade"];
  findings: string[];
  recommendations: string[];
  rubric: string[];
  tags: string[];
  response: string;
}

export interface BuildTrajectoryEvaluationReportInput {
  bundle: TrajectoryBundleEntry;
  focus: TrajectoryEvaluationBundle["focus"];
  purpose: string;
  tags: string[];
  rubric: string[];
  highlights: string[];
  score: number;
  grade: TrajectoryEvaluationBundle["grade"];
  findings: string[];
  recommendations: string[];
  prompt: string;
  response: string;
}

export interface BuildTrajectoryResearchPackageManifestInput {
  createdAt: string;
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  response: string;
}

export interface BuildTrajectoryResearchPackageReportInput {
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  purpose: string;
  mode: NonNullable<TrajectoryAnalysisBundle["mode"]>;
}

export function buildTrajectoryEvaluationSnapshot(
  input: BuildTrajectoryEvaluationSnapshotInput,
) {
  return {
    createdAt: input.createdAt,
    bundle: input.bundle,
    replay: input.replay,
    score: input.score,
    grade: input.grade,
    findings: input.findings,
    recommendations: input.recommendations,
    rubric: input.rubric,
    tags: input.tags,
    response: input.response,
  };
}

export function buildTrajectoryEvaluationReport(
  input: BuildTrajectoryEvaluationReportInput,
): string {
  return [
    `# Trajectory Evaluation: ${input.bundle.label}`,
    "",
    `- Score: ${input.score}/100`,
    `- Grade: ${input.grade}`,
    `- Focus: ${input.focus}`,
    `- Purpose: ${input.purpose}`,
    ...(input.tags.length ? [`- Tags: ${input.tags.join(", ")}`] : []),
    ...(input.rubric.length ? [`- Rubric: ${input.rubric.join(", ")}`] : []),
    "",
    "## Highlights",
    ...input.highlights.map((entry) => `- ${entry}`),
    "",
    "## Findings",
    ...(input.findings.length
      ? input.findings.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "## Recommendations",
    ...(input.recommendations.length
      ? input.recommendations.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "## Prompt",
    input.prompt,
    "",
    "## Response",
    input.response,
  ].join("\n");
}

export function buildTrajectoryResearchPackageManifest(
  input: BuildTrajectoryResearchPackageManifestInput,
) {
  return {
    createdAt: input.createdAt,
    bundle: input.analysis.bundle,
    replay: input.analysis.replay,
    analysis: {
      focus: input.analysis.focus,
      purpose: input.analysis.purpose,
      mode: input.analysis.mode,
      tags: input.analysis.tags,
      prompt: input.analysis.prompt,
      highlights: input.analysis.highlights,
    },
    evaluation: {
      focus: input.evaluation.focus,
      purpose: input.evaluation.purpose,
      mode: input.evaluation.mode,
      tags: input.evaluation.tags,
      score: input.evaluation.score,
      grade: input.evaluation.grade,
      findings: input.evaluation.findings,
      recommendations: input.evaluation.recommendations,
      evaluationPath: input.evaluation.evaluationPath,
      reportPath: input.evaluation.reportPath,
      responsePath: input.evaluation.responsePath,
    },
    response: input.response,
  };
}

export function buildTrajectoryResearchPackageReport(
  input: BuildTrajectoryResearchPackageReportInput,
): string {
  return [
    `# Trajectory Research Package: ${input.analysis.bundle.label}`,
    "",
    `- Focus: ${input.analysis.focus}`,
    `- Purpose: ${input.purpose}`,
    `- Mode: ${input.mode}`,
    ...(input.analysis.tags?.length
      ? [`- Tags: ${input.analysis.tags.join(", ")}`]
      : []),
    "",
    "## Export Bundle",
    `- Manifest: ${input.analysis.bundle.manifestPath}`,
    `- Data: ${input.analysis.bundle.dataPath}`,
    `- Summary: ${input.analysis.bundle.summaryPath ?? "none"}`,
    "",
    "## Replay",
    `- Replay file: ${input.analysis.replay.replayPath}`,
    `- Replay summary: ${input.analysis.replay.replaySummaryPath}`,
    `- Replay count: ${input.analysis.replay.replayCount}`,
    "",
    "## Analysis",
    `- Prompt: ${input.analysis.prompt.slice(0, 280)}`,
    ...(input.analysis.highlights.length
      ? input.analysis.highlights.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "## Evaluation",
    `- Score: ${input.evaluation.score}/100`,
    `- Grade: ${input.evaluation.grade}`,
    `- Findings: ${input.evaluation.findings.join("; ") || "none"}`,
    `- Recommendations: ${input.evaluation.recommendations.join("; ") || "none"}`,
    `- Report: ${input.evaluation.reportPath}`,
  ].join("\n");
}
