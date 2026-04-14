import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkCaseResult,
  TrajectoryBenchmarkManifest,
} from "../../../../types/trajectory";
import type { TrajectoryBenchmarkHost } from "../types";
import type { TrajectoryBenchmarkRunSummary } from "./summary";

export function writeTrajectoryBenchmarkRunArtifacts(input: {
  host: TrajectoryBenchmarkHost;
  manifest: TrajectoryBenchmarkManifest;
  createdAt: string;
  group: string;
  cases: TrajectoryBenchmarkCaseResult[];
  summary: TrajectoryBenchmarkRunSummary;
}): {
  manifestPath: string;
  summaryPath: string;
  reportPath: string;
} {
  const { host, manifest, createdAt, group, cases, summary } = input;
  const stamp = Date.now();
  const label = host.slug(`${manifest.label}-run`);
  const reportPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-benchmark-report.md`,
  );
  const summaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-benchmark-summary.md`,
  );
  const runManifestPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-benchmark-run.json`,
  );

  writeFileSync(
    runManifestPath,
    JSON.stringify(
      {
        createdAt,
        manifest,
        environment: manifest.environment,
        cases,
        averageScore: summary.averageScore,
        bestScore: summary.bestScore,
        worstScore: summary.worstScore,
        grade: summary.grade,
        findings: summary.findings,
        recommendations: summary.recommendations,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    [
      `# Trajectory Benchmark Run: ${manifest.label}`,
      "",
      `- Created: ${createdAt}`,
      `- Group: ${group}`,
      `- Average score: ${summary.averageScore}/100`,
      `- Grade: ${summary.grade}`,
      "",
      "## Environment",
      `- Provider: ${manifest.environment.provider}`,
      `- Model: ${manifest.environment.model}`,
      `- Base URL: ${manifest.environment.baseUrl || "n/a"}`,
      `- Temperature: ${manifest.environment.temperature}`,
      `- Max tokens: ${manifest.environment.maxTokens}`,
      "",
      "## Cases",
      ...cases.flatMap((entry) => [
        `### ${entry.case.label}`,
        `- Score: ${entry.evaluation.score}/100`,
        `- Grade: ${entry.evaluation.grade}`,
        ...(entry.comparison
          ? [`- Comparison: ${entry.comparison.recommendation}`]
          : []),
        ...(entry.evaluation.findings.length
          ? entry.evaluation.findings.map((finding) => `- ${finding}`)
          : ["- none"]),
        "",
      ]),
      "## Recommendations",
      ...(summary.recommendations.length
        ? summary.recommendations.map((entry) => `- ${entry}`)
        : ["- none"]),
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    summaryPath,
    [
      `# Trajectory Benchmark Summary: ${manifest.label}`,
      "",
      `- Average score: ${summary.averageScore}/100`,
      `- Grade: ${summary.grade}`,
      `- Cases: ${cases.length}`,
      "",
      "## Findings",
      ...summary.findings.map((entry) => `- ${entry}`),
    ].join("\n"),
    "utf8",
  );

  return {
    manifestPath: runManifestPath,
    summaryPath,
    reportPath,
  };
}
