import { describe, expect, it } from "vitest";
import type { RepositoryReview } from "../../shared/contracts";
import {
  canManagePullRequest,
  GitHubPullRequestPanel,
  pullRequestMutationNotice,
} from "./GitHubPullRequestPanel";

const readyReview: RepositoryReview = {
  state: "ready",
  local: {
    isRepository: true,
    branch: "feature/git-ui",
    head: "abc1234",
    ahead: 1,
    behind: 0,
    dirty: false,
    changedFiles: 0,
  },
  repository: {
    host: "github.com",
    owner: "SYMBaiEX",
    name: "doolittle",
    slug: "SYMBaiEX/doolittle",
    url: "https://github.com/SYMBaiEX/doolittle",
  },
  checks: [],
  workflowRuns: [],
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

describe("GitHubPullRequestPanel", () => {
  it("enables mutations for a ready GitHub repository or a branch without a PR", () => {
    expect(canManagePullRequest(readyReview)).toBe(true);
    expect(
      canManagePullRequest({
        ...readyReview,
        state: "degraded",
        degraded: {
          reason: "no_pull_request",
          detail: "No pull request exists for the current branch.",
        },
      }),
    ).toBe(true);
    expect(
      canManagePullRequest({
        ...readyReview,
        state: "degraded",
        degraded: {
          reason: "not_authenticated",
          detail: "Authenticate GitHub CLI.",
        },
      }),
    ).toBe(false);
    expect(
      canManagePullRequest({
        ...readyReview,
        repository: undefined,
      }),
    ).toBe(false);
  });

  it("keeps IPC cancellation distinct from a mutation failure", () => {
    expect(pullRequestMutationNotice({ status: "cancelled" })).toEqual({
      tone: "neutral",
      message: "Pull request operation cancelled.",
    });
    expect(
      pullRequestMutationNotice({
        type: "pr-merge",
        ok: false,
        summary: "Merge failed",
        stdout: "",
        stderr: "checks are still pending",
        exitCode: 1,
      }),
    ).toEqual({ tone: "bad", message: "checks are still pending" });
  });

  it("exports the interactive component", () => {
    expect(typeof GitHubPullRequestPanel).toBe("function");
  });
});
