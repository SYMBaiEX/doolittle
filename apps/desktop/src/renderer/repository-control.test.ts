import type { RepositoryMutationResult } from "@doolittle/contracts/repository";
import { describe, expect, it } from "vitest";
import {
  branchNameIsValid,
  gitChangeLabel,
  groupRepositoryChanges,
  mutationNotice,
  remoteNameIsValid,
  remoteUrlIsValid,
  requestLabel,
} from "./repository-control";

describe("groupRepositoryChanges", () => {
  it("separates staged, unstaged, and untracked changes", () => {
    const grouped = groupRepositoryChanges([
      { path: "staged.ts", status: "M", staged: true, untracked: false },
      { path: "working.ts", status: "M", staged: false, untracked: false },
      {
        path: "both.ts",
        status: "MM",
        staged: true,
        unstaged: true,
        untracked: false,
      },
      { path: "new.ts", status: "??", staged: false, untracked: true },
    ]);
    expect(grouped.staged.map((change) => change.path)).toEqual([
      "staged.ts",
      "both.ts",
    ]);
    expect(grouped.unstaged.map((change) => change.path)).toEqual([
      "working.ts",
      "both.ts",
    ]);
    expect(grouped.untracked.map((change) => change.path)).toEqual(["new.ts"]);
  });
});

describe("git controls helpers", () => {
  it("labels status and mutations without exposing raw porcelain", () => {
    expect(
      gitChangeLabel({
        path: "x",
        status: "R",
        staged: false,
        untracked: false,
      }),
    ).toBe("Renamed");
    expect(requestLabel({ type: "branch-switch", branch: "feature/ui" })).toBe(
      "Switching branch…",
    );
  });

  it("accepts safe branch and remote values", () => {
    expect(branchNameIsValid("feature/git-controls")).toBe(true);
    expect(branchNameIsValid("../unsafe")).toBe(false);
    expect(remoteNameIsValid("upstream-prod")).toBe(true);
    expect(remoteNameIsValid("origin remote")).toBe(false);
    expect(remoteUrlIsValid("git@github.com:SYMBaiEX/doolittle.git")).toBe(
      true,
    );
    expect(remoteUrlIsValid("not a remote")).toBe(false);
  });

  it("maps backend failures into an actionable notice", () => {
    const failure: RepositoryMutationResult = {
      type: "push",
      ok: false,
      summary: "Push failed",
      stdout: "",
      stderr: "rejected: non-fast-forward",
      exitCode: 1,
    };
    expect(mutationNotice(failure)).toEqual({
      tone: "bad",
      message: "rejected: non-fast-forward",
    });
  });
});
