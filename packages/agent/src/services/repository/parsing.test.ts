import { describe, expect, test } from "vitest";
import { parseStatusOutput, parseWorktrees } from "./parsing";

describe("repository output parsing", () => {
  test("preserves porcelain rename pairs and status semantics", () => {
    expect(
      parseStatusOutput("R  src/new.ts\0src/old.ts\0?? notes.txt\0"),
    ).toEqual([
      {
        path: "src/new.ts",
        previousPath: "src/old.ts",
        indexStatus: "R",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
        untracked: false,
      },
      {
        path: "notes.txt",
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        unstaged: true,
        untracked: true,
      },
    ]);
  });

  test("parses worktree fields and standalone flags", () => {
    expect(
      parseWorktrees(
        [
          "worktree /repo",
          "HEAD abc123",
          "branch refs/heads/main",
          "",
          "worktree /repo/task",
          "HEAD def456",
          "detached",
          "prunable stale metadata",
        ].join("\n"),
      ),
    ).toEqual([
      {
        path: "/repo",
        head: "abc123",
        branch: "main",
        detached: false,
        bare: false,
        prunable: false,
      },
      {
        path: "/repo/task",
        head: "def456",
        detached: true,
        bare: false,
        prunable: true,
      },
    ]);
  });
});
