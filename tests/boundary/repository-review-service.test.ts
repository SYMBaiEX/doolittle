import { describe, expect, it, vi } from "vitest";
import {
  RepositoryReviewProcessError,
  type RepositoryReviewProcessRequest,
  type RepositoryReviewProcessResult,
  RepositoryReviewService,
} from "../../packages/agent/src/services/repository-review";

const output = (
  stdout = "",
  exitCode = 0,
  stderr = "",
): RepositoryReviewProcessResult => ({
  stdout,
  stderr,
  exitCode,
});

function fixture(
  overrides: Record<string, RepositoryReviewProcessResult | Error> = {},
) {
  const pr = {
    number: 7,
    title: "  Fix\u0000 bug\u202E  ",
    state: "OPEN",
    url: "https://github.com/owner/project/pull/7#review",
    author: { login: " dev\u202E " },
    isDraft: true,
    additions: 4,
    deletions: -1,
    changedFiles: 2,
    comments: [{}, {}],
    reviews: [{}],
    reviewRequests: [{ login: "reviewer" }],
    labels: [{ name: "bug" }],
    reviewDecision: "APPROVED",
    mergeStateStatus: "CLEAN",
    headRefName: "feature",
    baseRefName: "main",
    updatedAt: "2026-11-03T01:00:00-05:00",
    statusCheckRollup: [
      {
        __typename: "CheckRun",
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://untrusted.example/check",
      },
      {
        __typename: "StatusContext",
        context: "deploy",
        state: "PENDING",
        targetUrl: "https://github.com/owner/project/actions/runs/4#job",
      },
    ],
  };
  const runs = [
    {
      databaseId: 4,
      workflowName: " CI ",
      status: "in progress",
      url: "https://github.com/owner/project/actions/runs/4",
      createdAt: "2026-11-03T06:00:00Z",
    },
  ];
  const responses: Record<string, RepositoryReviewProcessResult> = {
    "git rev-parse --show-toplevel": output("/review-root\n"),
    "git branch --show-current": output(" feature\n"),
    "git rev-parse --short HEAD": output("abc123\n"),
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}":
      output("origin/main\n"),
    "git rev-list --left-right --count @{upstream}...HEAD": output("2\t3\n"),
    "git status --porcelain=v1 -z --untracked-files=all": output(
      "R  new.txt\0old.txt\0?? notes.md\0",
    ),
    "git remote get-url origin": output("git@github.com:owner/project.git\n"),
    "gh --version": output("gh version fixture"),
    "gh auth": output(),
    "gh pr": output(JSON.stringify(pr)),
    "gh run": output(JSON.stringify(runs)),
  };
  const run = vi.fn(async (request: RepositoryReviewProcessRequest) => {
    const key =
      request.command === "gh" && request.args.length > 1
        ? `gh ${request.args[0]}`
        : `${request.command} ${request.args.join(" ")}`;
    const response = overrides[key] ?? responses[key];
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`Unexpected fixture request: ${key}`);
    return response;
  });
  const service = new RepositoryReviewService("/selected-workspace", {
    run,
    now: () => new Date("2026-11-03T06:00:00Z"),
  });
  return { service, run };
}

describe("repository review orchestration", () => {
  it("keeps Git state, sanitized remote data, and the supplied cancellation scope together", async () => {
    const { service, run } = fixture();
    const signal = new AbortController().signal;
    const result = await service.review(signal);
    expect(result).toMatchObject({
      state: "ready",
      fetchedAt: "2026-11-03T06:00:00.000Z",
      local: {
        root: "/review-root",
        branch: "feature",
        head: "abc123",
        upstream: "origin/main",
        ahead: 3,
        behind: 2,
        dirty: true,
        changedFiles: 2,
      },
      repository: {
        host: "github.com",
        slug: "owner/project",
        url: "https://github.com/owner/project",
      },
      pullRequest: {
        number: 7,
        title: "Fix bug",
        author: "dev",
        state: "open",
        isDraft: true,
        url: "https://github.com/owner/project/pull/7",
        additions: 4,
        deletions: 0,
        comments: 2,
        reviews: 1,
        reviewRequests: ["reviewer"],
        labels: ["bug"],
        reviewDecision: "approved",
        mergeStateStatus: "clean",
        updatedAt: "2026-11-03T06:00:00.000Z",
      },
      checks: [
        { name: "build", status: "completed", conclusion: "success" },
        {
          name: "deploy",
          status: "queued",
          conclusion: "pending",
          url: "https://github.com/owner/project/actions/runs/4",
        },
      ],
      workflowRuns: [
        {
          id: 4,
          name: "CI",
          status: "in_progress",
          createdAt: "2026-11-03T06:00:00.000Z",
        },
      ],
    });
    expect(result.checks[0]).not.toHaveProperty("url");
    expect(run.mock.calls).toHaveLength(11);
    expect(run.mock.calls.every(([request]) => request.signal === signal)).toBe(
      true,
    );
    expect(run.mock.calls[0][0].cwd).toBe("/selected-workspace");
    expect(
      run.mock.calls
        .slice(1)
        .every(([request]) => request.cwd === "/review-root"),
    ).toBe(true);
  });

  it.each([
    ["https://github.com/owner/project.git", "ready"],
    ["ssh://git@github.com/owner/project.git", "ready"],
    ["https://example.org/owner/project.git", "unsupported_remote"],
    ["git@github.com:owner/project/extra.git", "unsupported_remote"],
  ])(
    "handles origin %s through the same supported-remote boundary",
    async (remote, expected) => {
      const { service, run } = fixture({
        "git remote get-url origin": output(remote),
      });
      const result = await service.review();
      expect(
        result.state === "ready" ? result.state : result.degraded?.reason,
      ).toBe(expected);
      if (expected !== "ready")
        expect(
          run.mock.calls.some(([request]) => request.command === "gh"),
        ).toBe(false);
    },
  );

  it("keeps remote text and collection bounds while dropping invalid optional fields", async () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      name: `entry-${index}`,
    }));
    const { service } = fixture({
      "gh pr": output(
        JSON.stringify({
          number: 7,
          title: "x".repeat(600),
          state: "unexpected",
          url: "https://github.com/owner/project/pull/7",
          updatedAt: "invalid date",
          headRefName: "b".repeat(300),
          comments: entries,
          reviews: entries,
          labels: entries,
          reviewRequests: entries,
          statusCheckRollup: entries,
        }),
      ),
      "gh run": output(
        JSON.stringify(
          entries.map((entry, index) => ({
            databaseId: index + 1,
            name: entry.name,
            status: "unexpected",
            url: "https://user:secret@github.com/owner/project/actions/runs/4",
          })),
        ),
      ),
    });
    const result = await service.review();
    expect(result.state).toBe("ready");
    expect(result.pullRequest?.title).toHaveLength(500);
    expect(result.pullRequest?.headRefName).toHaveLength(255);
    expect(result.pullRequest).toMatchObject({
      state: "unknown",
      comments: 50,
      reviews: 50,
    });
    expect(result.pullRequest).not.toHaveProperty("updatedAt");
    expect(result.pullRequest?.labels).toHaveLength(50);
    expect(result.pullRequest?.reviewRequests).toHaveLength(50);
    expect(result.checks).toHaveLength(50);
    expect(result.workflowRuns).toHaveLength(50);
    expect(result.workflowRuns[0]).toMatchObject({ status: "unknown" });
    expect(result.workflowRuns[0]).not.toHaveProperty("url");
  });

  it("retains fetched workflow runs when the branch has no pull request", async () => {
    const { service } = fixture({
      "gh pr": output("", 1, "no pull requests found for branch"),
    });
    const result = await service.review();
    expect(result.degraded).toEqual({
      reason: "no_pull_request",
      detail: "No pull request exists for the current branch.",
    });
    expect(result.workflowRuns).toHaveLength(1);
    expect(result.checks).toEqual([]);
    expect(result.pullRequest).toBeUndefined();
  });

  it("refuses malformed workflow collections instead of returning a partial ready result", async () => {
    const { service } = fixture({ "gh run": output('[{"databaseId":4}]') });
    const result = await service.review();
    expect(result.degraded).toEqual({
      reason: "malformed_response",
      detail: "GitHub workflow run data was malformed.",
    });
    expect(result.workflowRuns).toEqual([]);
    expect(result.pullRequest).toBeUndefined();
  });

  it.each([
    ["missing", "git_unavailable"],
    ["timeout", "timeout"],
    ["output_limit", "malformed_response"],
    ["aborted", "malformed_response"],
  ] as const)("preserves %s process degradation", async (kind, reason) => {
    const { service } = fixture({
      "git rev-parse --show-toplevel": new RepositoryReviewProcessError(kind),
    });
    expect((await service.review()).degraded?.reason).toBe(reason);
  });

  it("classifies network auth failures without exposing command stderr", async () => {
    const { service, run } = fixture({
      "gh auth": output("", 1, "network error: private detail"),
    });
    const result = await service.review();
    expect(result.degraded).toEqual({
      reason: "network_error",
      detail: "GitHub could not be reached.",
    });
    expect(run.mock.calls.some(([request]) => request.args[0] === "pr")).toBe(
      false,
    );
  });
});
