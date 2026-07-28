import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AutocoderArtifactError,
  MAX_AUTOCODER_ARTIFACT_BYTES,
  readAutocoderArtifact,
} from "./artifacts";
import type { AutocoderPipelineRunRecord } from "./service";

function createRun(artifactPaths: string[]): AutocoderPipelineRunRecord {
  return {
    id: "run-1",
    workflowId: "workflow-1",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    startedAt: "2026-07-27T00:00:00.000Z",
    phase: "generate",
    kind: "generate",
    status: "completed",
    input: {},
    outputPreview: "done",
    artifactPaths,
  };
}

function expectArtifactError(callback: () => unknown, status: number): void {
  try {
    callback();
    throw new Error("Expected artifact read to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AutocoderArtifactError);
    expect((error as AutocoderArtifactError).status).toBe(status);
  }
}

describe("readAutocoderArtifact", () => {
  it("returns allowlisted text and binary artifacts without exposing a path", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-artifacts-"));
    const artifactRoot = join(root, "artifacts");
    mkdirSync(artifactRoot);
    const markdownPath = join(artifactRoot, "notes.md");
    const pngPath = join(artifactRoot, "preview.png");
    writeFileSync(markdownPath, "# Result\n");
    writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const run = createRun([markdownPath, pngPath]);

    expect(
      readAutocoderArtifact({ artifactRoot, run, runId: run.id, index: 0 }),
    ).toEqual({
      artifact: {
        runId: "run-1",
        index: 0,
        name: "notes.md",
        kind: "markdown",
        mimeType: "text/markdown",
        sizeBytes: 9,
      },
      encoding: "utf8",
      content: "# Result\n",
    });
    const binary = readAutocoderArtifact({
      artifactRoot,
      run,
      runId: run.id,
      index: 1,
    });
    expect(binary.encoding).toBe("base64");
    expect(binary.content).toBe("iVBORw==");
    expect(JSON.stringify(binary)).not.toContain(artifactRoot);
  });

  it("rejects missing, unsupported, oversized, symlink, and escaped files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-artifacts-"));
    const artifactRoot = join(root, "artifacts");
    mkdirSync(artifactRoot);
    const unsupportedPath = join(artifactRoot, "archive.zip");
    const oversizedPath = join(artifactRoot, "oversized.txt");
    const outsidePath = join(root, "outside.txt");
    const symlinkPath = join(artifactRoot, "linked.txt");
    writeFileSync(unsupportedPath, "zip");
    writeFileSync(
      oversizedPath,
      Buffer.alloc(MAX_AUTOCODER_ARTIFACT_BYTES + 1),
    );
    writeFileSync(outsidePath, "outside");
    symlinkSync(outsidePath, symlinkPath);

    expectArtifactError(
      () =>
        readAutocoderArtifact({
          artifactRoot,
          run: undefined,
          runId: "missing",
          index: 0,
        }),
      404,
    );
    expectArtifactError(
      () =>
        readAutocoderArtifact({
          artifactRoot,
          run: createRun([unsupportedPath]),
          runId: "run-1",
          index: 0,
        }),
      415,
    );
    expectArtifactError(
      () =>
        readAutocoderArtifact({
          artifactRoot,
          run: createRun([oversizedPath]),
          runId: "run-1",
          index: 0,
        }),
      413,
    );
    expectArtifactError(
      () =>
        readAutocoderArtifact({
          artifactRoot,
          run: createRun([symlinkPath]),
          runId: "run-1",
          index: 0,
        }),
      403,
    );
    expectArtifactError(
      () =>
        readAutocoderArtifact({
          artifactRoot,
          run: createRun([outsidePath]),
          runId: "run-1",
          index: 0,
        }),
      403,
    );
  });
});
