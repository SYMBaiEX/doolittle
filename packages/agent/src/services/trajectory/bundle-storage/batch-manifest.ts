import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TrajectoryBatchManifest } from "../../../types/trajectory";
import type {
  TrajectoryBatchManifestInput,
  TrajectoryBundleStorageHost,
} from "./types";

export function createTrajectoryBatchManifest(
  host: TrajectoryBundleStorageHost,
  input: TrajectoryBatchManifestInput,
): TrajectoryBatchManifest {
  const prompts = input.prompts.map((entry) => entry.trim()).filter(Boolean);
  const createdAt = new Date().toISOString();
  const label = host.slug(input.label ?? "trajectory-batch");
  const stamp = Date.now();
  const manifestPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-batch.json`,
  );
  const summaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-batch.md`,
  );
  const manifest = {
    createdAt,
    label,
    purpose: input.purpose ?? "trajectory batch",
    prompts,
    rubric: input.rubric ?? [],
    tags: input.tags ?? [],
    taskIds: input.taskIds ?? [],
    group: input.group ?? `trajectory-batch:${label}`,
    promptCount: prompts.length,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(
    summaryPath,
    [
      `# Trajectory Batch: ${label}`,
      "",
      `- Created: ${createdAt}`,
      `- Purpose: ${manifest.purpose}`,
      `- Group: ${manifest.group}`,
      `- Prompt count: ${prompts.length}`,
      ...(manifest.tags.length ? [`- Tags: ${manifest.tags.join(", ")}`] : []),
      ...(manifest.rubric.length
        ? [`- Rubric: ${manifest.rubric.join(", ")}`]
        : []),
      ...(manifest.taskIds.length
        ? [`- Tasks: ${manifest.taskIds.join(", ")}`]
        : []),
      "",
      "## Prompts",
      ...prompts.map((entry, index) => `${index + 1}. ${entry}`),
    ].join("\n"),
    "utf8",
  );

  return {
    manifestPath,
    summaryPath,
    createdAt,
    label,
    purpose: manifest.purpose,
    prompts,
    tags: manifest.tags,
    rubric: manifest.rubric,
    taskIds: manifest.taskIds,
    group: manifest.group,
  };
}
