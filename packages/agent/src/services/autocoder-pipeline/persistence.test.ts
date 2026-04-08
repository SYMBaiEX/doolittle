import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  });
});
