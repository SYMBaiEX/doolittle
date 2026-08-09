import { describe, expect, it } from "vitest";
import {
  boundedContext,
  commitRows,
  patchLines,
  statusLabel,
  toChanges,
} from "./models";

describe("coding workspace models", () => {
  it("normalizes repository changes and status labels", () => {
    const changes = toChanges({
      changes: [
        {
          path: "src/main.ts",
          indexStatus: "M",
          worktreeStatus: " ",
          staged: true,
          unstaged: false,
          untracked: false,
        },
        {
          path: "notes.txt",
          untracked: true,
        },
        { path: "" },
      ],
    });

    expect(changes).toHaveLength(2);
    const first = changes[0];
    const second = changes[1];
    if (!first || !second) throw new Error("expected normalized changes");
    expect(statusLabel(first)).toBe("M");
    expect(statusLabel(second)).toBe("U");
  });

  it("keeps duplicate diff lines addressable and classifies their tones", () => {
    const lines = patchLines("@@ -1 +1 @@\n-old\n+new\n+new");

    expect(lines.map((line) => line.tone)).toEqual([
      "header",
      "removal",
      "addition",
      "addition",
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length);
  });

  it("parses both git log text and structured records", () => {
    expect(commitRows("abc123 Fix editor\ndef456 Add tests")).toEqual([
      { id: "abc123:0", hash: "abc123", subject: "Fix editor" },
      { id: "def456:1", hash: "def456", subject: "Add tests" },
    ]);
    expect(commitRows([{ sha: "fedcba", message: "Ship workspace" }])).toEqual([
      { id: "fedcba:0", hash: "fedcba", subject: "Ship workspace" },
    ]);
  });

  it("bounds context without changing short content", () => {
    expect(boundedContext("short", 3)).toBe(
      "sho\n[…context truncated by Doolittle…]",
    );
    expect(boundedContext("short", 10)).toBe("short");
  });
});
