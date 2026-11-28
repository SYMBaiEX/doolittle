import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  canSelectPatchHunks,
  selectPatchHunks,
} from "../../apps/desktop/src/renderer/review/patch-selection";

const exec = promisify(execFile);

const alphaHeader = [
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 1111111..2222222 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
];
const firstHunk = [
  "@@ -10,2 +10,3 @@ export function alpha",
  " keep",
  "-old",
  "+new",
  "+another",
];
const secondHunk = ["@@ -30,0 +31,2 @@", "+later", "+more"];
const thirdHunk = [
  "@@ -50,2 +53,1 @@",
  " context",
  "-remove",
  " tail",
  "\\ No newline at end of file",
];
const betaHeader = [
  "diff --git a/docs/file name.md b/docs/file name.md",
  "--- a/docs/file name.md",
  "+++ b/docs/file name.md",
];
const betaHunk = ["@@ -3 +3 @@", "-before", "+after"];

function patchWithAlphaHunks(hunks: string[][]) {
  return [...alphaHeader, ...hunks.flat()].join("\n");
}

describe("review patch hunk selection", () => {
  it("rebuilds a patch with only the requested hunk and its file header", () => {
    const patch = [
      ...alphaHeader,
      ...firstHunk,
      ...secondHunk,
      ...betaHeader,
      ...betaHunk,
    ].join("\n");

    expect(selectPatchHunks(patch, [{ file: 0, hunk: 1 }])).toBe(
      `${[...alphaHeader, ...secondHunk].join("\n")}\n`,
    );
  });

  it("preserves file order for non-contiguous selections and no-newline markers", () => {
    const patch = patchWithAlphaHunks([firstHunk, secondHunk, thirdHunk]);

    const selected = selectPatchHunks(patch, [
      { file: 0, hunk: 2 },
      { file: 0, hunk: 0 },
    ]);

    expect(selected).toBe(
      `${[...alphaHeader, ...firstHunk, ...thirdHunk].join("\n")}\n`,
    );
    expect(selected).toContain("\\ No newline at end of file\n");
  });

  it("can select hunks across file sections while omitting unselected files", () => {
    const patch = [
      ...alphaHeader,
      ...firstHunk,
      ...betaHeader,
      ...betaHunk,
    ].join("\n");

    expect(
      selectPatchHunks(patch, [
        { file: 1, hunk: 0 },
        { file: 0, hunk: 0 },
      ]),
    ).toBe(
      `${[...alphaHeader, ...firstHunk, ...betaHeader, ...betaHunk].join("\n")}\n`,
    );
    expect(canSelectPatchHunks(patch)).toBe(true);
  });

  it("rejects empty, duplicate, and out-of-range selections", () => {
    const patch = patchWithAlphaHunks([firstHunk]);

    expect(() => selectPatchHunks(patch, [])).toThrow("At least one");
    expect(() =>
      selectPatchHunks(patch, [
        { file: 0, hunk: 0 },
        { file: 0, hunk: 0 },
      ]),
    ).toThrow("duplicates");
    expect(() => selectPatchHunks(patch, [{ file: 0, hunk: 1 }])).toThrow(
      "does not exist",
    );
  });

  it("does not treat traditional diffs without git file headers as appliable", () => {
    const traditional = [
      "--- a/one.txt",
      "+++ b/one.txt",
      "@@ -1 +1 @@",
      "-before",
      "+after",
    ].join("\n");

    expect(canSelectPatchHunks(traditional)).toBe(false);
    expect(() => selectPatchHunks(traditional, [{ file: 0, hunk: 0 }])).toThrow(
      "file headers",
    );
  });

  it("produces a subset that Git applies across shifted line offsets", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "doolittle-review-hunks-"));
    try {
      const git = (...args: string[]) =>
        exec(
          "git",
          [
            "-c",
            "user.name=Doolittle Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            ...args,
          ],
          { cwd: workspace, encoding: "utf8" },
        );
      const original = `${Array.from(
        { length: 80 },
        (_, index) => `line ${index + 1}`,
      ).join("\n")}\n`;
      await writeFile(join(workspace, "f.txt"), original);
      await git("init", "-b", "main");
      await git("add", "f.txt");
      await git("commit", "-m", "initial");

      const lines = original
        .trimEnd()
        .split("\n")
        .flatMap((line, index) =>
          index === 4
            ? [line, "inserted a", "inserted b", "inserted c"]
            : [line],
        );
      await writeFile(
        join(workspace, "f.txt"),
        `${lines.join("\n")}\n`
          .replace("line 35\n", "line thirty-five\n")
          .replace("line 65\n", ""),
      );
      const fullPatch = (
        await git("diff", "--no-ext-diff", "--unified=3", "--", "f.txt")
      ).stdout.replace(/\r?\n$/u, "");
      expect(fullPatch.match(/^@@ /gmu)).toHaveLength(3);
      const subset = selectPatchHunks(fullPatch, [
        { file: 0, hunk: 0 },
        { file: 0, hunk: 2 },
      ]);
      await writeFile(join(workspace, "subset.patch"), subset);

      await git("apply", "--cached", "--recount", "subset.patch");

      const staged = (await git("show", ":f.txt")).stdout;
      expect(staged).toContain("inserted a\n");
      expect(staged).not.toContain("line 65\n");
      expect(staged).toContain("line 35\n");
      expect(staged).not.toContain("line thirty-five\n");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
