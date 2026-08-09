import type {
  RepositoryReview,
  RepositoryReviewCheck,
  RepositoryWorkflowRun,
} from "../../shared/contracts";
import { asArray, asRecord, asString } from "../lib";
import type { RepositoryControlChange } from "../repository-control";

export type ReviewFilter = "all" | "approvals" | "ci" | "changes";
export type ReviewKind = Exclude<ReviewFilter, "all">;

export const REVIEW_FILTERS: ReadonlyArray<{
  id: ReviewFilter;
  label: string;
}> = [
  { id: "all", label: "Activity" },
  { id: "approvals", label: "Needs you" },
  { id: "changes", label: "Files" },
  { id: "ci", label: "Checks" },
];

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  title: string;
  description: string;
  status: string;
  timestamp?: string;
  path?: string;
  raw: Record<string, unknown>;
}

export interface ApprovalResponse {
  approvals?: unknown[];
}

export interface ChangesResponse {
  changes?: unknown[];
}

export interface RepositoryBranchesResponse {
  branches?: unknown[];
}

export interface RepositoryRemotesResponse {
  remotes?: unknown[];
}

export interface RepositoryStashesResponse {
  stashes?: unknown[];
}

export interface RepositoryConflictsResponse {
  conflicts?: unknown[];
}

export interface RepositoryWorktreesResponse {
  worktrees?: unknown[];
}

export interface RunsResponse {
  runs?: unknown[];
}

export interface PatchResponse {
  patch?: {
    patch?: string;
    truncated?: boolean;
  };
}

export function recordEventLabel(type: string): string {
  return type.replaceAll("_", " ");
}

export function gitChanges(
  value: ChangesResponse | null,
): RepositoryControlChange[] {
  return asArray(value?.changes).flatMap((entry) => {
    const record = asRecord(entry);
    const path = asString(record.path);
    if (!path) return [];
    return [
      {
        path,
        status:
          `${asString(record.indexStatus)}${asString(record.worktreeStatus)}`.trim(),
        staged: Boolean(record.staged),
        unstaged: Boolean(record.unstaged),
        untracked: Boolean(record.untracked),
      },
    ];
  });
}

export function gitRecords<T>(value: unknown[] | undefined): T[] {
  return asArray(value) as T[];
}

/** Keep local, GitHub check, and workflow status mappings distinct. */
export function statusTone(
  status: string,
): "neutral" | "good" | "warn" | "bad" {
  const value = status.toLowerCase();
  if (
    ["approved", "completed", "success", "used", "clean", "passed"].includes(
      value,
    )
  )
    return "good";
  if (
    [
      "denied",
      "failed",
      "failure",
      "cancelled",
      "expired",
      "error",
      "changes requested",
      "changes_requested",
    ].includes(value)
  )
    return "bad";
  if (
    [
      "pending",
      "queued",
      "in_progress",
      "running",
      "staged",
      "working",
      "draft",
      "blocked",
    ].includes(value)
  )
    return "warn";
  return "neutral";
}

export function checkDisplayStatus(check: RepositoryReviewCheck): string {
  const conclusion = check.conclusion?.toLowerCase();
  if (conclusion) {
    if (["success", "neutral", "skipped"].includes(conclusion)) {
      return conclusion === "success" ? "passed" : conclusion;
    }
    return conclusion;
  }
  return check.status;
}

export function workflowDisplayStatus(run: RepositoryWorkflowRun): string {
  return run.conclusion?.toLowerCase() || run.status;
}

export function compactCommand(command: string): string {
  const normalized = command.replace(/\s+/gu, " ").trim();
  return normalized.length > 110 ? `${normalized.slice(0, 109)}…` : normalized;
}

export function reviewItems(
  approvals: ApprovalResponse | null,
  changes: ChangesResponse | null,
  repositoryReview: RepositoryReview | undefined,
): ReviewItem[] {
  const approvalItems = asArray(approvals?.approvals).map((value, index) => {
    const record = asRecord(value);
    const id = asString(record.id, `approval-${index}`);
    return {
      id: `approvals:${id}`,
      kind: "approvals" as const,
      title: compactCommand(asString(record.command, "Command approval")),
      description: asString(
        record.reason,
        "The local agent requested permission to run this command.",
      ),
      status: asString(record.status, "pending"),
      timestamp: asString(record.createdAt) || undefined,
      raw: record,
    };
  });

  const changeItems = asArray(changes?.changes).map((value, index) => {
    const record = asRecord(value);
    const path = asString(record.path, `change-${index}`);
    const staged = Boolean(record.staged);
    const unstaged = Boolean(record.unstaged);
    const untracked = Boolean(record.untracked);
    return {
      id: `changes:${path}`,
      kind: "changes" as const,
      title: path.split("/").at(-1) ?? path,
      description: path,
      status: untracked
        ? "untracked"
        : staged && !unstaged
          ? "staged"
          : "working",
      timestamp: undefined,
      path,
      raw: record,
    };
  });

  const pullRequestItems: ReviewItem[] = repositoryReview?.pullRequest
    ? [
        {
          id: `ci:pr:${repositoryReview.pullRequest.number}`,
          kind: "ci",
          title: `#${repositoryReview.pullRequest.number} ${repositoryReview.pullRequest.title}`,
          description: `${repositoryReview.repository?.slug ?? "GitHub"} · ${
            repositoryReview.pullRequest.headRefName ??
            repositoryReview.branch ??
            "current branch"
          } → ${repositoryReview.pullRequest.baseRefName ?? "base"}`,
          status: repositoryReview.pullRequest.isDraft
            ? "draft"
            : repositoryReview.pullRequest.reviewDecision
                ?.toLowerCase()
                .replaceAll("_", " ") ||
              repositoryReview.pullRequest.mergeStateStatus
                ?.toLowerCase()
                .replaceAll("_", " ") ||
              repositoryReview.pullRequest.state,
          timestamp: repositoryReview.pullRequest.updatedAt,
          raw: {
            ...repositoryReview.pullRequest,
            category: "pull-request",
          },
        },
      ]
    : [];

  const checkItems: ReviewItem[] = (repositoryReview?.checks ?? []).map(
    (check, index) => ({
      id: `ci:check:${index}:${check.name}`,
      kind: "ci",
      title: check.name,
      description: check.workflow
        ? `${check.workflow} check`
        : "Pull request check",
      status: checkDisplayStatus(check),
      timestamp: check.completedAt ?? check.startedAt,
      raw: { ...check, category: "check" },
    }),
  );

  const workflowItems: ReviewItem[] = (
    repositoryReview?.workflowRuns ?? []
  ).map((run) => ({
    id: `ci:workflow:${run.id}`,
    kind: "ci",
    title: run.name,
    description: `${run.event ?? "workflow"} · ${
      run.headBranch ?? repositoryReview?.branch ?? "current branch"
    }`,
    status: workflowDisplayStatus(run),
    timestamp: run.updatedAt ?? run.createdAt,
    raw: { ...run, category: "workflow-run" },
  }));

  return [
    ...approvalItems,
    ...pullRequestItems,
    ...checkItems,
    ...changeItems,
    ...workflowItems,
  ].sort((left, right) => {
    const priority = (item: ReviewItem): number => {
      if (item.kind === "approvals" && item.status === "pending") return 100;
      if (item.kind === "ci" && statusTone(item.status) === "bad") return 90;
      if (item.kind === "ci" && statusTone(item.status) === "warn") return 80;
      return 0;
    };
    const leftPriority = priority(left);
    const rightPriority = priority(right);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
  });
}

export function filterReviewItems(
  items: ReviewItem[],
  filter: ReviewFilter,
  query: string,
): ReviewItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.description, item.status, item.kind].some(
      (value) => value.toLowerCase().includes(normalizedQuery),
    );
  });
}
