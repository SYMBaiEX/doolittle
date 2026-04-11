import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrajectoryBatchManifest } from "./batch-manifest";
import type { TrajectoryBundleStorageHost } from "./types";

describe("trajectory batch manifest builder", () => {
  it("writes batch manifest and summary artifacts with trimmed prompts", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-batch-manifest-"),
    );
    const host: TrajectoryBundleStorageHost = {
      baseDir: root,
      sessions: {
        recent() {
          return [];
        },
      },
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
    };

    try {
      const manifest = createTrajectoryBatchManifest(host, {
        label: "Unit Batch",
        prompts: ["  first prompt ", "", "second prompt", "  "],
        tags: ["testing"],
        rubric: ["clarity"],
        taskIds: ["t-1", "t-2"],
        group: "group-alpha",
      });
      const summary = readFileSync(manifest.summaryPath, "utf8");

      expect(manifest.prompts).toEqual(["first prompt", "second prompt"]);
      expect(manifest.prompts).toHaveLength(2);
      expect(summary).toContain("# Trajectory Batch: unit-batch");
      expect(summary).toContain("- Prompt count: 2");
      expect(summary).toContain("- Tags: testing");
      expect(summary).toContain("1. first prompt");
      expect(summary).toContain("2. second prompt");
      const parsed = JSON.parse(readFileSync(manifest.manifestPath, "utf8"));
      expect(parsed.rubric).toEqual(["clarity"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
