import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryAnalysisBundle,
  TrajectoryBundleEntry,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import {
  buildTrajectoryEvaluationReport,
  buildTrajectoryEvaluationSnapshot,
  buildTrajectoryResearchPackageManifest,
  buildTrajectoryResearchPackageReport,
} from "./evaluation-reporting";

interface TrajectoryArtifactWriterInput {
  baseDir: string;
  slug(value: string): string;
  now?: number;
  createdAt?: string;
}

export interface WriteTrajectoryEvaluationArtifactsInput
  extends TrajectoryArtifactWriterInput {
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  focus: TrajectoryEvaluationBundle["focus"];
  purpose: string;
  reportTags: string[];
  jsonTags: string[];
  rubric: string[];
  highlights: string[];
  prompt: string;
  score: number;
  grade: TrajectoryEvaluationBundle["grade"];
  findings: string[];
  recommendations: string[];
  response: string;
}

export interface WriteTrajectoryResearchPackageArtifactsInput
  extends TrajectoryArtifactWriterInput {
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  response: string;
  purpose: string;
  mode: NonNullable<TrajectoryAnalysisBundle["mode"]>;
}

export interface TrajectoryEvaluationArtifactPaths {
  evaluationPath: string;
  reportPath: string;
  responsePath: string;
}

export interface TrajectoryResearchPackageArtifactPaths {
  packageManifestPath: string;
  reportPath: string;
  responsePath: string;
}

function resolveTrajectoryArtifactMetadata(
  input: TrajectoryArtifactWriterInput,
) {
  return {
    stamp: input.now ?? Date.now(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function writeTrajectoryEvaluationArtifacts(
  input: WriteTrajectoryEvaluationArtifactsInput,
): TrajectoryEvaluationArtifactPaths {
  const { stamp, createdAt } = resolveTrajectoryArtifactMetadata(input);
  const label = input.slug(`${input.bundle.label}-evaluation`);
  const evaluationPath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}.evaluation.json`,
  );
  const reportPath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}-evaluation.md`,
  );
  const responsePath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}-evaluation-response.md`,
  );

  writeFileSync(
    evaluationPath,
    JSON.stringify(
      buildTrajectoryEvaluationSnapshot({
        createdAt,
        bundle: input.bundle,
        replay: input.replay,
        score: input.score,
        grade: input.grade,
        findings: input.findings,
        recommendations: input.recommendations,
        rubric: input.rubric,
        tags: input.jsonTags,
        response: input.response,
      }),
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    buildTrajectoryEvaluationReport({
      bundle: input.bundle,
      focus: input.focus,
      purpose: input.purpose,
      tags: input.reportTags,
      rubric: input.rubric,
      highlights: input.highlights,
      score: input.score,
      grade: input.grade,
      findings: input.findings,
      recommendations: input.recommendations,
      prompt: input.prompt,
      response: input.response,
    }),
    "utf8",
  );

  writeFileSync(responsePath, input.response, "utf8");

  return {
    evaluationPath,
    reportPath,
    responsePath,
  };
}

export function writeTrajectoryResearchPackageArtifacts(
  input: WriteTrajectoryResearchPackageArtifactsInput,
): TrajectoryResearchPackageArtifactPaths {
  const { stamp, createdAt } = resolveTrajectoryArtifactMetadata(input);
  const label = input.slug(`${input.analysis.bundle.label}-package`);
  const packageManifestPath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}-package.json`,
  );
  const reportPath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}-package.md`,
  );
  const responsePath = join(
    input.baseDir,
    `trajectory-${stamp}-${label}-package-response.md`,
  );

  writeFileSync(
    packageManifestPath,
    JSON.stringify(
      buildTrajectoryResearchPackageManifest({
        createdAt,
        analysis: input.analysis,
        evaluation: input.evaluation,
        response: input.response,
      }),
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    buildTrajectoryResearchPackageReport({
      analysis: input.analysis,
      evaluation: input.evaluation,
      purpose: input.purpose,
      mode: input.mode,
    }),
    "utf8",
  );

  writeFileSync(responsePath, input.response, "utf8");

  return {
    packageManifestPath,
    reportPath,
    responsePath,
  };
}
