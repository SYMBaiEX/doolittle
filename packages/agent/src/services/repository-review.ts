import { parseLocalSummary } from "./repository-review/git";
import {
  parsePullRequest,
  parseRemote,
  parseWorkflowRuns,
} from "./repository-review/github";
import {
  parseJsonArray,
  parseJsonRecord,
  sanitizedText,
} from "./repository-review/normalization";
import {
  classifyFailure,
  looksLikeAuthenticationFailure,
  looksLikeNetworkFailure,
  looksLikeNoPullRequest,
  RepositoryReviewProcessError,
  runRepositoryReviewProcess,
} from "./repository-review/process";
import type {
  RepositoryReviewDegradedReason,
  RepositoryReviewLocalSummary,
  RepositoryReviewProcessResult,
  RepositoryReviewProcessRunner,
  RepositoryReviewResult,
  RepositoryReviewServiceOptions,
} from "./repository-review/types";

export {
  RepositoryReviewProcessError,
  runRepositoryReviewProcess,
} from "./repository-review/process";
export type {
  RepositoryPullRequest,
  RepositoryReviewCheck,
  RepositoryReviewDegradedReason,
  RepositoryReviewLocalSummary,
  RepositoryReviewProcessRequest,
  RepositoryReviewProcessResult,
  RepositoryReviewProcessRunner,
  RepositoryReviewRemote,
  RepositoryReviewResult,
  RepositoryWorkflowRun,
} from "./repository-review/types";

function degraded(
  local: RepositoryReviewLocalSummary,
  fetchedAt: string,
  reason: RepositoryReviewDegradedReason,
  detail: string,
  partial?: Partial<RepositoryReviewResult>,
): RepositoryReviewResult {
  return {
    state: "degraded",
    local,
    checks: partial?.checks ?? [],
    workflowRuns: partial?.workflowRuns ?? [],
    fetchedAt,
    ...partial,
    degraded: { reason, detail },
  };
}

export class RepositoryReviewService {
  private readonly run: RepositoryReviewProcessRunner;
  private readonly now: () => Date;

  constructor(
    private readonly workspaceDir: string,
    options: RepositoryReviewServiceOptions = {},
  ) {
    this.run = options.run ?? runRepositoryReviewProcess;
    this.now = options.now ?? (() => new Date());
  }

  async review(signal?: AbortSignal): Promise<RepositoryReviewResult> {
    const fetchedAt = this.now().toISOString();
    let local: RepositoryReviewLocalSummary = {
      isRepository: false,
      ahead: 0,
      behind: 0,
      dirty: false,
      changedFiles: 0,
    };

    let rootResult: RepositoryReviewProcessResult;
    try {
      rootResult = await this.run({
        command: "git",
        args: ["rev-parse", "--show-toplevel"],
        cwd: this.workspaceDir,
        signal,
      });
    } catch (failure) {
      if (
        failure instanceof RepositoryReviewProcessError &&
        failure.kind === "missing"
      ) {
        return degraded(
          local,
          fetchedAt,
          "git_unavailable",
          "Git is not installed or is not available on PATH.",
        );
      }
      const classified = classifyFailure(failure, "git");
      return degraded(local, fetchedAt, classified.reason, classified.detail);
    }
    if (rootResult.exitCode !== 0) {
      return degraded(
        local,
        fetchedAt,
        "not_repository",
        "The selected workspace is not inside a Git repository.",
      );
    }

    const root = sanitizedText(rootResult.stdout, 4_096);
    if (!root) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "Git did not return a usable repository root.",
      );
    }
    local = { ...local, isRepository: true, root };

    let results: RepositoryReviewProcessResult[];
    try {
      results = await Promise.all(
        [
          ["branch", "--show-current"],
          ["rev-parse", "--short", "HEAD"],
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
          ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
          ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
          ["remote", "get-url", "origin"],
        ].map((args) => this.run({ command: "git", args, cwd: root, signal })),
      );
    } catch (failure) {
      const classified = classifyFailure(failure, "git");
      return degraded(local, fetchedAt, classified.reason, classified.detail);
    }

    local = parseLocalSummary(root, results);
    const { branch } = local;
    const remoteResult = results[5];

    const repository =
      remoteResult?.exitCode === 0 ? parseRemote(remoteResult.stdout) : null;
    if (!repository) {
      return degraded(
        local,
        fetchedAt,
        "unsupported_remote",
        "The origin remote is not a supported GitHub HTTPS or SSH repository.",
        { branch },
      );
    }
    if (!branch) {
      return degraded(
        local,
        fetchedAt,
        "no_pull_request",
        "The repository is detached or has no current branch to review.",
        { repository },
      );
    }

    try {
      const version = await this.run({
        command: "gh",
        args: ["--version"],
        cwd: root,
        signal,
      });
      if (version.exitCode !== 0) {
        return degraded(
          local,
          fetchedAt,
          "gh_unavailable",
          "GitHub CLI is installed but unavailable.",
          { repository, branch },
        );
      }
    } catch (failure) {
      if (
        failure instanceof RepositoryReviewProcessError &&
        failure.kind === "missing"
      ) {
        return degraded(
          local,
          fetchedAt,
          "gh_unavailable",
          "GitHub CLI is not installed or is not available on PATH.",
          { repository, branch },
        );
      }
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }

    let auth: RepositoryReviewProcessResult;
    try {
      auth = await this.run({
        command: "gh",
        args: ["auth", "status", "--hostname", repository.host],
        cwd: root,
        signal,
      });
    } catch (failure) {
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }
    if (auth.exitCode !== 0) {
      const network = looksLikeNetworkFailure(auth.stderr);
      return degraded(
        local,
        fetchedAt,
        network ? "network_error" : "not_authenticated",
        network
          ? "GitHub could not be reached."
          : "GitHub CLI is not authenticated for github.com.",
        { repository, branch },
      );
    }

    let prResult: RepositoryReviewProcessResult;
    let runsResult: RepositoryReviewProcessResult;
    try {
      [prResult, runsResult] = await Promise.all([
        this.run({
          command: "gh",
          args: [
            "pr",
            "view",
            branch,
            "--repo",
            repository.slug,
            "--json",
            "number,title,state,url,author,isDraft,reviewDecision,mergeStateStatus,headRefName,baseRefName,additions,deletions,changedFiles,comments,reviews,reviewRequests,labels,updatedAt,statusCheckRollup",
          ],
          cwd: root,
          signal,
        }),
        this.run({
          command: "gh",
          args: [
            "run",
            "list",
            "--branch",
            branch,
            "--repo",
            repository.slug,
            "--limit",
            "10",
            "--json",
            "databaseId,name,workflowName,status,conclusion,url,event,headBranch,createdAt,updatedAt",
          ],
          cwd: root,
          signal,
        }),
      ]);
    } catch (failure) {
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }

    const runsJson =
      runsResult.exitCode === 0 ? parseJsonArray(runsResult.stdout) : null;
    const workflowRuns = runsJson ? parseWorkflowRuns(runsJson) : null;
    if (runsResult.exitCode !== 0) {
      return degraded(
        local,
        fetchedAt,
        looksLikeNetworkFailure(runsResult.stderr)
          ? "network_error"
          : "malformed_response",
        looksLikeNetworkFailure(runsResult.stderr)
          ? "GitHub workflow runs could not be reached."
          : "GitHub workflow runs could not be read.",
        { repository, branch },
      );
    }
    if (!workflowRuns) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "GitHub workflow run data was malformed.",
        { repository, branch },
      );
    }

    if (prResult.exitCode !== 0) {
      const noPullRequest = looksLikeNoPullRequest(prResult.stderr);
      const networkFailure = looksLikeNetworkFailure(prResult.stderr);
      const authenticationFailure = looksLikeAuthenticationFailure(
        prResult.stderr,
      );
      const reason: RepositoryReviewDegradedReason = noPullRequest
        ? "no_pull_request"
        : networkFailure
          ? "network_error"
          : authenticationFailure
            ? "not_authenticated"
            : "malformed_response";
      return degraded(
        local,
        fetchedAt,
        reason,
        noPullRequest
          ? "No pull request exists for the current branch."
          : networkFailure
            ? "GitHub pull request data could not be reached."
            : authenticationFailure
              ? "GitHub CLI authentication is no longer valid."
              : "GitHub pull request data could not be read.",
        { repository, branch, workflowRuns },
      );
    }
    const prJson = parseJsonRecord(prResult.stdout);
    const parsedPullRequest = prJson ? parsePullRequest(prJson) : null;
    if (!parsedPullRequest) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "GitHub pull request or check data was malformed.",
        { repository, branch, workflowRuns },
      );
    }

    return {
      state: "ready",
      local,
      repository,
      branch,
      pullRequest: parsedPullRequest.pullRequest,
      checks: parsedPullRequest.checks,
      workflowRuns,
      fetchedAt,
    };
  }
}
