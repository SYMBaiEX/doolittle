import { asRecord } from "@elizaos/shared/type-guards";
import {
  MAX_URL_LENGTH,
  normalizedStatus,
  sanitizedCount,
  sanitizedDate,
  sanitizedGithubUrl,
  sanitizedOptionalText,
  sanitizedText,
} from "./normalization";
import type {
  RepositoryPullRequest,
  RepositoryReviewCheck,
  RepositoryReviewRemote,
  RepositoryWorkflowRun,
} from "./types";

const MAX_COLLECTION_SIZE = 50;

export function parseRemote(value: string): RepositoryReviewRemote | null {
  const raw = sanitizedText(value, MAX_URL_LENGTH);
  if (!raw) return null;

  let host = "";
  let pathname = "";
  if (/^[^/@\s]+@[^:/\s]+:[^/\s].*$/u.test(raw)) {
    const separator = raw.indexOf(":");
    const identity = raw.slice(0, separator);
    host = identity.slice(identity.lastIndexOf("@") + 1).toLowerCase();
    pathname = raw.slice(separator + 1);
  } else {
    try {
      const url = new URL(raw);
      if (!["https:", "ssh:"].includes(url.protocol)) return null;
      host = url.hostname.toLowerCase();
      pathname = url.pathname.replace(/^\/+/u, "");
    } catch {
      return null;
    }
  }

  if (host !== "github.com") return null;
  const segments = pathname.replace(/\.git$/u, "").split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  const safeSegment = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/u;
  if (!owner || !name || !safeSegment.test(owner) || !safeSegment.test(name)) {
    return null;
  }
  return {
    host: "github.com",
    owner,
    name,
    slug: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

function parseChecks(value: unknown): RepositoryReviewCheck[] | null {
  if (!Array.isArray(value)) return null;
  const checks: RepositoryReviewCheck[] = [];
  for (const item of value.slice(0, MAX_COLLECTION_SIZE)) {
    const record = asRecord(item);
    if (!record) return null;
    const typename = sanitizedText(record.__typename, 32);
    const name =
      typename === "StatusContext"
        ? sanitizedText(record.context)
        : sanitizedText(record.name);
    if (!name) return null;
    const check: RepositoryReviewCheck = {
      name,
      status:
        typename === "StatusContext"
          ? normalizedStatus(
              sanitizedText(record.state, 32).toLowerCase() === "pending"
                ? "queued"
                : "completed",
            )
          : normalizedStatus(record.status),
    };
    const conclusion = sanitizedOptionalText(
      typename === "StatusContext" ? record.state : record.conclusion,
      64,
    );
    const url = sanitizedGithubUrl(
      typename === "StatusContext" ? record.targetUrl : record.detailsUrl,
    );
    const workflow = sanitizedOptionalText(record.workflowName);
    const startedAt = sanitizedDate(record.startedAt);
    const completedAt = sanitizedDate(record.completedAt);
    if (conclusion) check.conclusion = conclusion.toLowerCase();
    if (url) check.url = url;
    if (workflow) check.workflow = workflow;
    if (startedAt) check.startedAt = startedAt;
    if (completedAt) check.completedAt = completedAt;
    checks.push(check);
  }
  return checks;
}

function recordName(value: unknown): string | undefined {
  if (typeof value === "string") return sanitizedOptionalText(value, 100);
  const record = asRecord(value);
  return sanitizedOptionalText(record?.login ?? record?.name, 100);
}

function recordNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_COLLECTION_SIZE)
    .map(recordName)
    .filter((name): name is string => Boolean(name));
}

export function parsePullRequest(record: Record<string, unknown>): {
  pullRequest: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
} | null {
  const number = sanitizedCount(record.number);
  const title = sanitizedText(record.title);
  const url = sanitizedGithubUrl(record.url);
  const checks = parseChecks(record.statusCheckRollup);
  if (!number || !title || !url || !checks) return null;
  const stateText = sanitizedText(record.state, 32).toLowerCase();
  const state = ["open", "closed", "merged"].includes(stateText)
    ? (stateText as RepositoryPullRequest["state"])
    : "unknown";
  const author = recordName(record.author);
  const pullRequest: RepositoryPullRequest = {
    number,
    title,
    state,
    url,
    isDraft: record.isDraft === true,
    additions: sanitizedCount(record.additions),
    deletions: sanitizedCount(record.deletions),
    changedFiles: sanitizedCount(record.changedFiles),
    comments: Array.isArray(record.comments)
      ? Math.min(record.comments.length, MAX_COLLECTION_SIZE)
      : 0,
    reviews: Array.isArray(record.reviews)
      ? Math.min(record.reviews.length, MAX_COLLECTION_SIZE)
      : 0,
    reviewRequests: recordNames(record.reviewRequests),
    labels: recordNames(record.labels),
  };
  if (author) pullRequest.author = author;
  const reviewDecision = sanitizedOptionalText(record.reviewDecision, 64);
  const mergeStateStatus = sanitizedOptionalText(record.mergeStateStatus, 64);
  const headRefName = sanitizedOptionalText(record.headRefName, 255);
  const baseRefName = sanitizedOptionalText(record.baseRefName, 255);
  const updatedAt = sanitizedDate(record.updatedAt);
  if (reviewDecision) pullRequest.reviewDecision = reviewDecision.toLowerCase();
  if (mergeStateStatus) {
    pullRequest.mergeStateStatus = mergeStateStatus.toLowerCase();
  }
  if (headRefName) pullRequest.headRefName = headRefName;
  if (baseRefName) pullRequest.baseRefName = baseRefName;
  if (updatedAt) pullRequest.updatedAt = updatedAt;
  return { pullRequest, checks };
}

export function parseWorkflowRuns(
  value: unknown[],
): RepositoryWorkflowRun[] | null {
  const runs: RepositoryWorkflowRun[] = [];
  for (const item of value.slice(0, MAX_COLLECTION_SIZE)) {
    const record = asRecord(item);
    if (!record) return null;
    const id = sanitizedCount(record.databaseId);
    const name = sanitizedText(record.workflowName ?? record.name);
    if (!id || !name) return null;
    const run: RepositoryWorkflowRun = {
      id,
      name,
      status: normalizedStatus(record.status),
    };
    const conclusion = sanitizedOptionalText(record.conclusion, 64);
    const url = sanitizedGithubUrl(record.url);
    const event = sanitizedOptionalText(record.event, 64);
    const headBranch = sanitizedOptionalText(record.headBranch, 255);
    const createdAt = sanitizedDate(record.createdAt);
    const updatedAt = sanitizedDate(record.updatedAt);
    if (conclusion) run.conclusion = conclusion.toLowerCase();
    if (url) run.url = url;
    if (event) run.event = event;
    if (headBranch) run.headBranch = headBranch;
    if (createdAt) run.createdAt = createdAt;
    if (updatedAt) run.updatedAt = updatedAt;
    runs.push(run);
  }
  return runs;
}
