export type RepositoryReviewDegradedReason =
  | "not_repository"
  | "git_unavailable"
  | "gh_unavailable"
  | "not_authenticated"
  | "unsupported_remote"
  | "no_pull_request"
  | "network_error"
  | "malformed_response"
  | "execution_unavailable"
  | "termination_unconfirmed"
  | "timeout";

export interface RepositoryReviewLocalSummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

export interface RepositoryReviewRemote {
  host: "github.com";
  owner: string;
  name: string;
  slug: string;
  url: string;
}

export interface RepositoryPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "unknown";
  url: string;
  author?: string;
  isDraft: boolean;
  reviewDecision?: string;
  mergeStateStatus?: string;
  headRefName?: string;
  baseRefName?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviews: number;
  reviewRequests: string[];
  labels: string[];
  updatedAt?: string;
}

export interface RepositoryReviewCheck {
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  workflow?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RepositoryWorkflowRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  event?: string;
  headBranch?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RepositoryReviewResult {
  state: "ready" | "degraded";
  local: RepositoryReviewLocalSummary;
  repository?: RepositoryReviewRemote;
  branch?: string;
  pullRequest?: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
  workflowRuns: RepositoryWorkflowRun[];
  degraded?: {
    reason: RepositoryReviewDegradedReason;
    detail: string;
  };
  fetchedAt: string;
}

export interface RepositoryReviewProcessRequest {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
}

export interface RepositoryReviewProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RepositoryReviewProcessRunner = (
  request: RepositoryReviewProcessRequest,
) => Promise<RepositoryReviewProcessResult>;

export interface RepositoryReviewServiceOptions {
  run?: RepositoryReviewProcessRunner;
  now?: () => Date;
}
