import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAutocoderPipelinePersistence } from "./persistence";

describe("AutocoderPipelinePersistence", () => {
  it("loads, saves, writes artifacts, and generates stable ids", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-persistence-"));
    const persistence = createAutocoderPipelinePersistence(root);

    expect(persistence.loadStore()).toEqual({ runs: [], workflows: [] });

    persistence.saveStore({
      runs: [
        {
          id: "run-1",
          workflowId: "workflow-1",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          startedAt: "2026-04-01T00:00:00.000Z",
          phase: "generate",
          kind: "generate",
          status: "running",
          input: {},
          outputPreview: "running",
          artifactPaths: [],
        },
      ],
      workflows: [],
    });

    expect(persistence.loadStore().runs).toHaveLength(1);
    const savedRun = persistence.loadStore().runs[0];
    if (!savedRun) throw new Error("Expected saved run.");
    expect(() =>
      persistence.saveStore({
        runs: [{ ...savedRun, outputPreview: "x".repeat(4 * 1024 * 1024) }],
        workflows: [],
      }),
    ).toThrow("byte limit");
    expect(persistence.loadStore().runs[0]?.outputPreview).toBe("running");
    chmodSync(join(root, "artifacts"), 0o755);
    expect(
      createAutocoderPipelinePersistence(root).loadStore().runs,
    ).toHaveLength(1);
    expect(statSync(join(root, "artifacts")).mode & 0o777).toBe(0o700);
    const artifactPath = persistence.writeArtifact(
      "run-1",
      "My Pipeline",
      "request",
      { hello: "world" },
    );
    expect(existsSync(artifactPath)).toBe(true);
    expect(readFileSync(artifactPath, "utf8")).toContain('"hello": "world"');
    expect(persistence.nextId("workflow", "My Pipeline")).toMatch(
      /^workflow-my-pipeline-/,
    );
    expect(() =>
      persistence.writeArtifact(
        persistence.nextId("github.create", "repo"),
        "repo",
        "request",
        {},
      ),
    ).not.toThrow();
  });

  it("fails visibly for invalid existing stores and rejects artifact path components", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-invalid-"));
    try {
      const persistence = createAutocoderPipelinePersistence(root);
      const path = join(root, "pipeline-runs.json");
      writeFileSync(path, JSON.stringify({ runs: "invalid", workflows: [] }));
      expect(() => persistence.loadStore()).toThrow("invalid structure");
      expect(() => persistence.saveStore({ runs: [], workflows: [] })).toThrow(
        "invalid structure",
      );
      expect(() =>
        persistence.writeArtifact("../escape", "name", "request", {}),
      ).toThrow();
      expect(() =>
        persistence.writeArtifact("run-1", "name", "../escape", {}),
      ).toThrow();
      rmSync(path);
      const outside = join(root, "outside.json");
      writeFileSync(outside, "{}", "utf8");
      symlinkSync(outside, path);
      expect(() => persistence.loadStore()).toThrow();
      expect(readFileSync(outside, "utf8")).toBe("{}");
      rmSync(path);
      writeFileSync(path, "x".repeat(4 * 1024 * 1024 + 1));
      expect(() => persistence.loadStore()).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects a pipeline FIFO without blocking",
    () => {
      const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-fifo-"));
      try {
        const persistence = createAutocoderPipelinePersistence(root);
        const result = spawnSync("mkfifo", [join(root, "pipeline-runs.json")]);
        if (result.error || result.status !== 0)
          throw new Error("mkfifo unavailable");
        expect(() => persistence.loadStore()).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
