import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkCase,
  TrajectoryBenchmarkCaseInput,
  TrajectoryBenchmarkCaseResult,
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryModelContext,
  TrajectoryReplayResult,
} from "../../types/trajectory";

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
    options?: {
      rubric?: string[];
      tags?: string[];
      replay?: TrajectoryReplayResult;
      prompt?: string;
      highlights?: string[];
      mode?: "dataset" | "research" | "evaluation" | "rl";
      purpose?: string;
    },
  ): Promise<TrajectoryEvaluationBundle>;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function describeTrajectoryBenchmarkEnvironment(
  host: TrajectoryBenchmarkHost,
): TrajectoryBenchmarkEnvironmentSummary {
  const latestBundle = host.listBundles(1)[0];
  const context = host.getModelContext?.();
  return {
    provider: context?.provider ?? "offline",
    model: context?.model ?? "offline",
    baseUrl: context?.baseUrl ?? "",
    temperature: context?.temperature ?? 0,
    maxTokens: context?.maxTokens ?? 0,
    bundleCount: host.listBundles(100).length,
    latestBundleLabel: latestBundle?.label,
    latestBundleCreatedAt: latestBundle?.createdAt,
    canEvaluate: true,
    canPackage: true,
  };
}

export function createTrajectoryBenchmarkManifest(
  host: TrajectoryBenchmarkHost,
  input: {
    label?: string;
    purpose?: string;
    tags?: string[];
    rubric?: string[];
    group?: string;
    cases: TrajectoryBenchmarkCaseInput[];
  },
): TrajectoryBenchmarkManifest {
  if (!input.cases.length) {
    throw new Error("At least one benchmark case is required.");
  }
  const createdAt = new Date().toISOString();
  const label = host.slug(input.label ?? "trajectory-benchmark");
  const stamp = Date.now();
  const manifestPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-benchmark.json`,
  );
  const summaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-benchmark.md`,
  );
  const bundles = host.listBundles(200);
  const environment = describeTrajectoryBenchmarkEnvironment(host);
  const cases = input.cases.map((entry, index) => {
    const resolvedPath =
      entry.manifestPath ??
      bundles.find(
        (bundle) =>
          bundle.label === entry.label ||
          bundle.manifestPath.endsWith(entry.label ?? ""),
      )?.manifestPath;
    if (!resolvedPath) {
      throw new Error(
        `Benchmark case ${index + 1} is missing a resolvable manifestPath or label.`,
      );
    }
    const bundle = host.describeBundle(resolvedPath);
    return {
      manifestPath: bundle.manifestPath,
      label: entry.label ?? bundle.label,
      purpose: entry.purpose ?? bundle.purpose,
      tags: entry.tags ?? bundle.tags,
      rubric: entry.rubric ?? input.rubric ?? [],
      notes: entry.notes ?? bundle.notes,
      mode: entry.mode ?? bundle.mode,
    };
  });
  const manifest = {
    createdAt,
    label,
    purpose: input.purpose ?? "trajectory benchmark",
    tags: input.tags ?? [],
    rubric: input.rubric ?? [],
    cases,
    group: input.group ?? `trajectory-benchmark:${label}`,
    environment,
    manifestPath,
    summaryPath,
    caseCount: cases.length,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(
    summaryPath,
    [
      `# Trajectory Benchmark: ${label}`,
      "",
      `- Created: ${createdAt}`,
      `- Purpose: ${manifest.purpose}`,
      `- Group: ${manifest.group}`,
      `- Case count: ${cases.length}`,
      `- Provider: ${environment.provider}`,
      `- Model: ${environment.model}`,
      ...(manifest.tags.length ? [`- Tags: ${manifest.tags.join(", ")}`] : []),
      ...(manifest.rubric.length
        ? [`- Rubric: ${manifest.rubric.join(", ")}`]
        : []),
      "",
      "## Cases",
      ...cases.map(
        (entry) =>
          `- ${entry.label}: ${entry.manifestPath}${entry.purpose ? ` :: ${entry.purpose}` : ""}`,
      ),
    ].join("\n"),
    "utf8",
  );

  return {
    manifestPath,
    summaryPath,
    createdAt,
    label,
    purpose: manifest.purpose,
    tags: manifest.tags,
    rubric: manifest.rubric,
    cases,
    group: manifest.group,
    environment,
  };
}

export async function runTrajectoryBenchmark(
  host: TrajectoryBenchmarkHost,
  manifestPath: string,
): Promise<TrajectoryBenchmarkRun> {
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as TrajectoryBenchmarkManifest;
  if (!manifest.cases?.length) {
    throw new Error("Benchmark manifest does not contain any cases.");
  }
  const createdAt = new Date().toISOString();
  const group = manifest.group ?? `trajectory-benchmark:${manifest.label}`;
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

  const scores = cases.map((entry) => entry.evaluation.score);
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const bestScore = scores.length ? Math.max(...scores) : 0;
  const worstScore = scores.length ? Math.min(...scores) : 0;
  const grade: "A" | "B" | "C" | "D" | "F" =
    averageScore >= 90
      ? "A"
      : averageScore >= 80
        ? "B"
        : averageScore >= 70
          ? "C"
          : averageScore >= 60
            ? "D"
            : "F";
  const findings = [
    `Average score: ${averageScore}/100.`,
    `Best score: ${bestScore}/100.`,
    `Worst score: ${worstScore}/100.`,
    ...cases.flatMap((entry) => [
      `${entry.case.label}: ${entry.evaluation.grade} (${entry.evaluation.score}/100)`,
      ...entry.evaluation.findings.slice(0, 2).map((finding) => `- ${finding}`),
    ]),
  ];
  const recommendations = unique(
    cases.flatMap((entry) => entry.evaluation.recommendations),
  ).slice(0, 10);
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
        averageScore,
        bestScore,
        worstScore,
        grade,
        findings,
        recommendations,
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
      `- Average score: ${averageScore}/100`,
      `- Grade: ${grade}`,
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
      ...(recommendations.length
        ? recommendations.map((entry) => `- ${entry}`)
        : ["- none"]),
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    summaryPath,
    [
      `# Trajectory Benchmark Summary: ${manifest.label}`,
      "",
      `- Average score: ${averageScore}/100`,
      `- Grade: ${grade}`,
      `- Cases: ${cases.length}`,
      "",
      "## Findings",
      ...findings.map((entry) => `- ${entry}`),
    ].join("\n"),
    "utf8",
  );

  return {
    manifestPath: runManifestPath,
    summaryPath,
    createdAt,
    label: manifest.label,
    purpose: manifest.purpose,
    group,
    environment: manifest.environment,
    cases,
    averageScore,
    bestScore,
    worstScore,
    grade,
    findings,
    recommendations,
    reportPath,
  };
}
