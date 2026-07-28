import { describe, expect, it } from "vitest";
import {
  RepositoryReviewProcessError,
  type RepositoryReviewProcessRequest,
  type RepositoryReviewProcessResult,
  type RepositoryReviewProcessRunner,
  RepositoryReviewService,
  runRepositoryReviewProcess,
} from "./repository-review";

const ROOT = "/workspace/doolittle";

function key(request: RepositoryReviewProcessRequest): string {
  return [request.command, ...request.args].join(" ");
}

function result(
  stdout = "",
  options: { exitCode?: number; stderr?: string } = {},
): RepositoryReviewProcessResult {
  return {
    exitCode: options.exitCode ?? 0,
    stdout,
    stderr: options.stderr ?? "",
  };
}

function createResponses(): Map<string, RepositoryReviewProcessResult | Error> {
  return new Map([
    ["git rev-parse --show-toplevel", result(`${ROOT}\n`)],
    ["git branch --show-current", result("feature/review\n")],
    ["git rev-parse --short HEAD", result("abc1234\n")],
    [
      "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
      result("origin/feature/review\n"),
    ],
    ["git rev-list --left-right --count @{upstream}...HEAD", result("2\t3\n")],
    [
      "git status --porcelain=v1 -z --untracked-files=all",
      result("R  src/renamed.ts\0src/old.ts\0?? new.ts\0"),
    ],
    [
      "git remote get-url origin",
      result("https://operator:secret@github.com/elizaOS/doolittle.git\n"),
    ],
    ["gh --version", result("gh version 2.70.0\n")],
    ["gh auth status --hostname github.com", result("")],
    [
      "gh pr view feature/review --repo elizaOS/doolittle --json number,title,state,url,author,isDraft,reviewDecision,mergeStateStatus,headRefName,baseRefName,additions,deletions,changedFiles,comments,reviews,reviewRequests,labels,updatedAt,statusCheckRollup",
      result(
        JSON.stringify({
          number: 42,
          title: "Desktop review\u0000",
          state: "OPEN",
          url: "https://github.com/elizaOS/doolittle/pull/42#fragment",
          author: { login: "operator" },
          isDraft: false,
          reviewDecision: "APPROVED",
          mergeStateStatus: "CLEAN",
          headRefName: "feature/review",
          baseRefName: "main",
          additions: 120,
          deletions: 20,
          changedFiles: 8,
          comments: [{ id: "one" }],
          reviews: [{ id: "two" }],
          reviewRequests: [{ login: "reviewer" }],
          labels: [{ name: "desktop" }],
          updatedAt: "2026-07-27T12:00:00Z",
          statusCheckRollup: [
            {
              __typename: "CheckRun",
              name: "test",
              status: "COMPLETED",
              conclusion: "SUCCESS",
              detailsUrl:
                "https://github.com/elizaOS/doolittle/actions/runs/100",
              workflowName: "CI",
              startedAt: "2026-07-27T11:00:00Z",
              completedAt: "2026-07-27T11:05:00Z",
            },
            {
              __typename: "StatusContext",
              context: "release",
              state: "PENDING",
              targetUrl: "javascript:alert(1)",
            },
          ],
        }),
      ),
    ],
    [
      "gh run list --branch feature/review --repo elizaOS/doolittle --limit 10 --json databaseId,name,workflowName,status,conclusion,url,event,headBranch,createdAt,updatedAt",
      result(
        JSON.stringify([
          {
            databaseId: 100,
            name: "CI run",
            workflowName: "CI",
            status: "completed",
            conclusion: "success",
            url: "https://github.com/elizaOS/doolittle/actions/runs/100",
            event: "pull_request",
            headBranch: "feature/review",
            createdAt: "2026-07-27T11:00:00Z",
            updatedAt: "2026-07-27T11:05:00Z",
          },
        ]),
      ),
    ],
  ]);
}

function createRunner(
  responses = createResponses(),
  requests: RepositoryReviewProcessRequest[] = [],
): RepositoryReviewProcessRunner {
  return async (request) => {
    requests.push(request);
    const response = responses.get(key(request));
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`Unexpected command: ${key(request)}`);
    return response;
  };
}

function createService(
  responses = createResponses(),
  requests: RepositoryReviewProcessRequest[] = [],
): RepositoryReviewService {
  return new RepositoryReviewService(ROOT, {
    run: createRunner(responses, requests),
    now: () => new Date("2026-07-27T13:00:00Z"),
  });
}

describe("RepositoryReviewService", () => {
  it("normalizes local, pull request, check, and workflow run data", async () => {
    const requests: RepositoryReviewProcessRequest[] = [];
    const review = await createService(createResponses(), requests).review();

    expect(review).toMatchObject({
      state: "ready",
      fetchedAt: "2026-07-27T13:00:00.000Z",
      local: {
        isRepository: true,
        root: ROOT,
        branch: "feature/review",
        head: "abc1234",
        upstream: "origin/feature/review",
        ahead: 3,
        behind: 2,
        dirty: true,
        changedFiles: 2,
      },
      repository: {
        host: "github.com",
        owner: "elizaOS",
        name: "doolittle",
        slug: "elizaOS/doolittle",
        url: "https://github.com/elizaOS/doolittle",
      },
      pullRequest: {
        number: 42,
        title: "Desktop review",
        state: "open",
        author: "operator",
        reviewDecision: "approved",
        mergeStateStatus: "clean",
      },
      checks: [
        { name: "test", status: "completed", conclusion: "success" },
        { name: "release", status: "queued", conclusion: "pending" },
      ],
      workflowRuns: [
        {
          id: 100,
          name: "CI",
          status: "completed",
          conclusion: "success",
        },
      ],
    });
    expect(review.pullRequest?.url).toBe(
      "https://github.com/elizaOS/doolittle/pull/42",
    );
    expect(review.checks[1]?.url).toBeUndefined();
    expect(JSON.stringify(review)).not.toContain("secret");
    expect(
      requests.every(
        (request) => request.command === "git" || request.command === "gh",
      ),
    ).toBe(true);
    expect(requests.every((request) => Array.isArray(request.args))).toBe(true);
  });

  it("accepts GitHub SSH and SCP remotes without exposing credentials", async () => {
    for (const remote of [
      "ssh://git@github.com/elizaOS/doolittle.git",
      "git@github.com:elizaOS/doolittle.git",
    ]) {
      const responses = createResponses();
      responses.set("git remote get-url origin", result(remote));
      const review = await createService(responses).review();
      expect(review.repository).toMatchObject({
        slug: "elizaOS/doolittle",
        url: "https://github.com/elizaOS/doolittle",
      });
      expect(JSON.stringify(review)).not.toContain("git@");
    }
  });

  it("returns a local summary with typed missing-tool degradation", async () => {
    const missingGit = createResponses();
    missingGit.set(
      "git rev-parse --show-toplevel",
      new RepositoryReviewProcessError("missing"),
    );
    const gitReview = await createService(missingGit).review();
    expect(gitReview).toMatchObject({
      state: "degraded",
      degraded: { reason: "git_unavailable" },
      local: { isRepository: false, changedFiles: 0 },
    });

    const missingGh = createResponses();
    missingGh.set("gh --version", new RepositoryReviewProcessError("missing"));
    const ghReview = await createService(missingGh).review();
    expect(ghReview).toMatchObject({
      state: "degraded",
      degraded: { reason: "gh_unavailable" },
      local: { isRepository: true, changedFiles: 2 },
      repository: { slug: "elizaOS/doolittle" },
    });
  });

  it("classifies unsupported remotes, authentication, no-PR, and network failures", async () => {
    const unsupported = createResponses();
    unsupported.set(
      "git remote get-url origin",
      result("https://gitlab.com/elizaOS/doolittle.git"),
    );
    expect((await createService(unsupported).review()).degraded?.reason).toBe(
      "unsupported_remote",
    );

    const unauthenticated = createResponses();
    unauthenticated.set(
      "gh auth status --hostname github.com",
      result("", { exitCode: 1, stderr: "not logged in as private-user" }),
    );
    const authReview = await createService(unauthenticated).review();
    expect(authReview.degraded?.reason).toBe("not_authenticated");
    expect(JSON.stringify(authReview)).not.toContain("private-user");

    const noPr = createResponses();
    noPr.set(
      "gh pr view feature/review --repo elizaOS/doolittle --json number,title,state,url,author,isDraft,reviewDecision,mergeStateStatus,headRefName,baseRefName,additions,deletions,changedFiles,comments,reviews,reviewRequests,labels,updatedAt,statusCheckRollup",
      result("", {
        exitCode: 1,
        stderr: "no pull requests found for branch feature/review",
      }),
    );
    const noPrReview = await createService(noPr).review();
    expect(noPrReview).toMatchObject({
      degraded: { reason: "no_pull_request" },
      workflowRuns: [{ id: 100 }],
    });

    const network = createResponses();
    network.set(
      "gh auth status --hostname github.com",
      result("", {
        exitCode: 1,
        stderr: "could not resolve host github.com token=private",
      }),
    );
    const networkReview = await createService(network).review();
    expect(networkReview.degraded?.reason).toBe("network_error");
    expect(JSON.stringify(networkReview)).not.toContain("private");
  });

  it("classifies malformed and timed-out command results", async () => {
    const malformed = createResponses();
    malformed.set(
      "gh run list --branch feature/review --repo elizaOS/doolittle --limit 10 --json databaseId,name,workflowName,status,conclusion,url,event,headBranch,createdAt,updatedAt",
      result("{not-json"),
    );
    expect((await createService(malformed).review()).degraded?.reason).toBe(
      "malformed_response",
    );

    const timedOut = createResponses();
    timedOut.set("gh --version", new RepositoryReviewProcessError("timeout"));
    expect((await createService(timedOut).review()).degraded?.reason).toBe(
      "timeout",
    );
  });

  it("forwards cancellation to every command request", async () => {
    const requests: RepositoryReviewProcessRequest[] = [];
    const controller = new AbortController();
    await createService(createResponses(), requests).review(controller.signal);
    expect(requests).not.toHaveLength(0);
    expect(
      requests.every((request) => request.signal === controller.signal),
    ).toBe(true);
  });
});

describe("runRepositoryReviewProcess", () => {
  it("sets non-interactive GitHub CLI environment values", async () => {
    const processResult = await runRepositoryReviewProcess({
      command: process.execPath,
      args: [
        "-e",
        "console.log([process.env.GH_PROMPT_DISABLED,process.env.GH_PAGER,process.env.NO_COLOR].join('|'))",
      ],
      cwd: process.cwd(),
    });

    expect(processResult.exitCode).toBe(0);
    expect(processResult.stdout.trim()).toBe("1|cat|1");
  });

  it("rejects missing commands and kills output beyond the shared limit", async () => {
    await expect(
      runRepositoryReviewProcess({
        command: "doolittle-command-that-does-not-exist",
        args: [],
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({ kind: "missing" });

    await expect(
      runRepositoryReviewProcess({
        command: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(600 * 1024))"],
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({ kind: "output_limit" });
  });

  it("kills a running process when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = runRepositoryReviewProcess({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 30_000)"],
      cwd: process.cwd(),
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
  });
});
