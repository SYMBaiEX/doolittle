import { describe, expect, it } from "vitest";
import { parseStructuredPatch } from "../../apps/desktop/src/renderer/review/patch-structure";

describe("structured review patch parsing", () => {
  it("builds file, hunk, and numbered line structure from a multi-file patch", () => {
    const patch = [
      "diff --git a/src/alpha.ts b/src/alpha.ts",
      "index 1111111..2222222 100644",
      "--- a/src/alpha.ts",
      "+++ b/src/alpha.ts",
      "@@ -10,2 +10,3 @@ export function alpha",
      " keep",
      "-old",
      "+new",
      "+another",
      "\\ No newline at end of file",
      "@@ -30,0 +31,2 @@",
      "+later",
      "+more",
      "diff --git a/src/old-name.ts b/src/new-name.ts",
      "similarity index 88%",
      "rename from src/old-name.ts",
      "rename to src/new-name.ts",
      "",
    ].join("\n");

    const structured = parseStructuredPatch(patch);

    expect(structured.additions).toBe(4);
    expect(structured.deletions).toBe(1);
    expect(structured.files).toHaveLength(2);

    const [alpha, rename] = structured.files;
    expect(alpha).toMatchObject({
      oldPath: "src/alpha.ts",
      newPath: "src/alpha.ts",
      displayPath: "src/alpha.ts",
      status: "modified",
      additions: 4,
      deletions: 1,
      metadataLines: ["index 1111111..2222222 100644"],
    });
    expect(alpha.headerLines).toEqual([
      "diff --git a/src/alpha.ts b/src/alpha.ts",
      "--- a/src/alpha.ts",
      "+++ b/src/alpha.ts",
    ]);
    expect(alpha.hunks).toHaveLength(2);
    expect(alpha.hunks[0]).toMatchObject({
      oldStart: 10,
      oldCount: 2,
      newStart: 10,
      newCount: 3,
      section: "export function alpha",
      complete: true,
    });
    expect(alpha.hunks[0]?.lines).toMatchObject([
      { kind: "context", oldLine: 10, newLine: 10, text: " keep" },
      { kind: "deletion", oldLine: 11, text: "-old" },
      { kind: "addition", newLine: 11, text: "+new" },
      { kind: "addition", newLine: 12, text: "+another" },
      { kind: "meta", text: "\\ No newline at end of file" },
    ]);
    expect(alpha.hunks[1]?.lines).toMatchObject([
      { kind: "addition", newLine: 31 },
      { kind: "addition", newLine: 32 },
    ]);

    expect(rename).toMatchObject({
      oldPath: "src/old-name.ts",
      newPath: "src/new-name.ts",
      displayPath: "src/new-name.ts",
      status: "renamed",
      hunks: [],
    });
  });

  it("recognizes added and deleted files from dev-null headers and modes", () => {
    const patch = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1 @@",
      "+created",
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-removed",
    ].join("\n");

    const [added, deleted] = parseStructuredPatch(patch).files;
    expect(added).toMatchObject({
      displayPath: "new.txt",
      status: "added",
      additions: 1,
    });
    expect(deleted).toMatchObject({
      displayPath: "old.txt",
      status: "deleted",
      deletions: 1,
    });
  });

  it("accepts an implicit single-file patch and CRLF input", () => {
    const structured = parseStructuredPatch(
      "@@ -1,2 +1,2 @@\r\n same\r\n-old\r\n+new\r\n",
    );

    expect(structured.files).toHaveLength(1);
    expect(structured.files[0]?.displayPath).toBeUndefined();
    expect(structured.files[0]?.hunks[0]?.lines).toMatchObject([
      { kind: "context", oldLine: 1, newLine: 1 },
      { kind: "deletion", oldLine: 2 },
      { kind: "addition", newLine: 2 },
    ]);
  });

  it("retains metadata-only and truncated patch content instead of dropping it", () => {
    const structured = parseStructuredPatch(
      [
        "diff --git a/image.png b/image.png",
        "index 1111111..2222222 100644",
        "Binary files a/image.png and b/image.png differ",
        "diff --git a/src/truncated.ts b/src/truncated.ts",
        "@@ -4,2 +4,2 @@",
        " context",
        "-old",
      ].join("\n"),
    );

    expect(structured.files[0]).toMatchObject({
      displayPath: "image.png",
      hunks: [],
      metadataLines: [
        "index 1111111..2222222 100644",
        "Binary files a/image.png and b/image.png differ",
      ],
    });
    expect(structured.files[1]?.hunks[0]).toMatchObject({
      complete: false,
      lines: [
        { kind: "context", oldLine: 4, newLine: 4 },
        { kind: "deletion", oldLine: 5 },
      ],
    });
  });

  it("splits traditional unified diffs without git headers into files", () => {
    const structured = parseStructuredPatch(
      [
        "--- a/one.txt",
        "+++ b/one.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "--- a/two.txt",
        "+++ b/two.txt",
        "@@ -2 +2 @@",
        "-old",
        "+new",
      ].join("\n"),
    );

    expect(structured.files).toHaveLength(2);
    expect(structured.files[0]?.displayPath).toBe("one.txt");
    expect(structured.files[1]?.displayPath).toBe("two.txt");
    expect(structured.files[1]?.hunks[0]?.lines).toMatchObject([
      { kind: "deletion", oldLine: 2 },
      { kind: "addition", newLine: 2 },
    ]);
  });

  it("parses paths with spaces and quoted git paths", () => {
    const spaced = parseStructuredPatch(
      [
        "diff --git a/docs/file name.txt b/docs/file name.txt",
        "--- a/docs/file name.txt",
        "+++ b/docs/file name.txt",
      ].join("\n"),
    );
    const quoted = parseStructuredPatch(
      [
        'diff --git "a/docs/\\"quoted\\".txt" "b/docs/\\"quoted\\".txt"',
        '--- "a/docs/\\"quoted\\".txt"',
        '+++ "b/docs/\\"quoted\\".txt"',
      ].join("\n"),
    );

    expect(spaced.files[0]?.displayPath).toBe("docs/file name.txt");
    expect(quoted.files[0]?.displayPath).toBe('docs/"quoted".txt');
  });
});
