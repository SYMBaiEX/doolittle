import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkCase,
  TrajectoryBenchmarkManifest,
} from "../../../types/trajectory";
import { describeTrajectoryBenchmarkEnvironment } from "./environment";
import type {
  TrajectoryBenchmarkHost,
  TrajectoryBenchmarkManifestInput,
} from "./types";

function resolveTrajectoryBenchmarkCases(
  host: TrajectoryBenchmarkHost,
  input: TrajectoryBenchmarkManifestInput,
): TrajectoryBenchmarkCase[] {
  const bundles = host.listBundles(200);
  return input.cases.map((entry, index) => {
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
}

function writeTrajectoryBenchmarkManifestSummary(
  manifest: TrajectoryBenchmarkManifest,
): void {
  writeFileSync(
    manifest.summaryPath,
    [
      `# Trajectory Benchmark: ${manifest.label}`,
      "",
      `- Created: ${manifest.createdAt}`,
      `- Purpose: ${manifest.purpose}`,
      `- Group: ${manifest.group}`,
      `- Case count: ${manifest.cases.length}`,
      `- Provider: ${manifest.environment.provider}`,
      `- Model: ${manifest.environment.model}`,
      ...(manifest.tags.length ? [`- Tags: ${manifest.tags.join(", ")}`] : []),
      ...(manifest.rubric.length
        ? [`- Rubric: ${manifest.rubric.join(", ")}`]
        : []),
      "",
      "## Cases",
      ...manifest.cases.map(
        (entry) =>
          `- ${entry.label}: ${entry.manifestPath}${entry.purpose ? ` :: ${entry.purpose}` : ""}`,
      ),
    ].join("\n"),
    "utf8",
  );
}

export function createTrajectoryBenchmarkManifest(
  host: TrajectoryBenchmarkHost,
  input: TrajectoryBenchmarkManifestInput,
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
  const manifest: TrajectoryBenchmarkManifest = {
    manifestPath,
    summaryPath,
    createdAt,
    label,
    purpose: input.purpose ?? "trajectory benchmark",
    tags: input.tags ?? [],
    rubric: input.rubric ?? [],
    cases: resolveTrajectoryBenchmarkCases(host, input),
    group: input.group ?? `trajectory-benchmark:${label}`,
    environment: describeTrajectoryBenchmarkEnvironment(host),
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeTrajectoryBenchmarkManifestSummary(manifest);

  return manifest;
}
