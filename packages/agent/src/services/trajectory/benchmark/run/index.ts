import type {
  TrajectoryBenchmarkCaseResult,
  TrajectoryBenchmarkManifest,
} from "../../../../types/trajectory";
import { describeTrajectoryBenchmarkManifest } from "../../bundle-storage";
import { TrajectoryInputError } from "../../bundle-storage/safe-read";
import type { TrajectoryBenchmarkHost } from "../types";
import { writeTrajectoryBenchmarkRunArtifacts } from "./artifacts";
import { runTrajectoryBenchmarkCases } from "./execution";
import {
  summarizeTrajectoryBenchmarkRun,
  type TrajectoryBenchmarkRunSummary,
} from "./summary";

export async function runTrajectoryBenchmark(
  host: TrajectoryBenchmarkHost,
  manifestPath: string,
): Promise<{
  manifestPath: string;
  summaryPath: string;
  createdAt: string;
  label: string;
  purpose: string;
  group: string;
  environment: TrajectoryBenchmarkManifest["environment"];
  cases: TrajectoryBenchmarkCaseResult[];
  averageScore: number;
  bestScore: number;
  worstScore: number;
  grade: TrajectoryBenchmarkRunSummary["grade"];
  findings: string[];
  recommendations: string[];
  reportPath: string;
}> {
  const manifest = describeTrajectoryBenchmarkManifest(
    host.baseDir,
    manifestPath,
  );

  if (!manifest.cases?.length) {
    throw new TrajectoryInputError();
  }

  const createdAt = new Date().toISOString();
  const group = manifest.group ?? `trajectory-benchmark:${manifest.label}`;
  const cases = await runTrajectoryBenchmarkCases(host, manifest);
  const summary = summarizeTrajectoryBenchmarkRun(cases);
  const artifacts = writeTrajectoryBenchmarkRunArtifacts({
    host,
    manifest,
    createdAt,
    group,
    cases,
    summary,
  });

  return {
    manifestPath: artifacts.manifestPath,
    summaryPath: artifacts.summaryPath,
    createdAt,
    label: manifest.label,
    purpose: manifest.purpose,
    group,
    environment: manifest.environment,
    cases,
    averageScore: summary.averageScore,
    bestScore: summary.bestScore,
    worstScore: summary.worstScore,
    grade: summary.grade,
    findings: summary.findings,
    recommendations: summary.recommendations,
    reportPath: artifacts.reportPath,
  };
}
