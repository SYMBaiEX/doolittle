import { describe, expect, it } from "bun:test";
import {
  normalizeExecutionWorktrees,
  worktreeLabel,
} from "./ExecutionEnvironmentPanel";

describe("execution environment helpers", () => {
  it("normalizes only confirmed local worktree fields", () => {
    expect(
      normalizeExecutionWorktrees([
        {
          path: "/repo/.doolittle/worktrees/feature",
          branch: "feature/desktop",
          head: "abc123",
          detached: false,
          bare: false,
          prunable: false,
        },
        { branch: "missing-path" },
      ]),
    ).toEqual([
      {
        path: "/repo/.doolittle/worktrees/feature",
        branch: "feature/desktop",
        head: "abc123",
        detached: false,
        bare: false,
        prunable: false,
      },
    ]);
  });

  it("labels detached worktrees without inventing a branch", () => {
    expect(
      worktreeLabel({
        path: "/repo/detached",
        branch: "",
        head: "abc123",
        detached: true,
        bare: false,
        prunable: false,
      }),
    ).toBe("Detached HEAD");
  });
});
