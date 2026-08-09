import type { RepositoryMutationResult } from "@doolittle/contracts/repository";

export type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";

export interface RepositoryWorktreeCreateRequest {
  branch: string;
  path: string;
}
export type RepositoryReviewDegradedReason =
  | "not_repository"
  | "git_unavailable"
  | "gh_unavailable"
  | "not_authenticated"
  | "unsupported_remote"
  | "no_pull_request"
  | "network_error"
  | "malformed_response"
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
export interface RepositoryReview {
  state: "ready" | "degraded";
  local: RepositoryReviewLocalSummary;
  repository?: RepositoryReviewRemote;
  branch?: string;
  pullRequest?: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
  workflowRuns: RepositoryWorkflowRun[];
  degraded?: { reason: RepositoryReviewDegradedReason; detail: string };
  fetchedAt: string;
}
export interface RepositoryReviewResponse {
  review: RepositoryReview;
}
export interface RepositoryWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}
export type RepositoryWorktreeCreateResult =
  | { status: "cancelled" }
  | { status: "created"; worktree: RepositoryWorktree };
export type RepositoryMutationDesktopResult =
  | { status: "cancelled" }
  | { status: "completed"; result: RepositoryMutationResult };
