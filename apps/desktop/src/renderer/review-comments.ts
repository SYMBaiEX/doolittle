import type { RepositoryReview } from "../shared/contracts";
import { escapeXml } from "./xml-escape";

export const REVIEW_COMMENT_BODY_LIMIT = 2_000;
export const REVIEW_FEEDBACK_LIMIT = 12_000;
// Version 1 keyed drafts only by repository root and HEAD. A shared commit can
// exist on more than one branch, so keep version 1 inaccessible rather than
// guessing which branch owns those drafts during durable-record migration.
const REVIEW_COMMENT_STORAGE_PREFIX = "doolittle.review-comments.v2";

export type ReviewCommentSide = "old" | "new";
export type ReviewCommentStatus = "open" | "resolved";

export interface ReviewCommentAnchor {
  side: ReviewCommentSide;
  line: number;
  preview: string;
}

export interface ReviewComment {
  id: string;
  path: string;
  anchor?: ReviewCommentAnchor;
  body: string;
  status: ReviewCommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCommentIdentity {
  workspace: string;
  branch: string;
  revision: string;
  storageKey: string;
}

export interface ReviewCommentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ReviewRecordEvent {
  id: string;
  type:
    | "comment_created"
    | "comment_edited"
    | "comment_resolved"
    | "comment_reopened"
    | "comment_deleted"
    | "feedback_sent";
  commentId?: string;
  detail: string;
  createdAt: string;
}

export interface ReviewRecordSnapshot {
  scope: {
    repositoryRoot: string;
    branch: string;
    head: string;
  };
  comments: ReviewComment[];
  events: ReviewRecordEvent[];
  updatedAt: string;
}

export interface ReviewRecordResponse {
  record: ReviewRecordSnapshot;
  entries?: Array<ReviewComment | ReviewRecordEvent>;
  nextCursor?: string;
}

export interface ReviewPatchLine {
  key: string;
  kind: "addition" | "deletion" | "hunk" | "meta" | "context";
  line: string;
  anchor?: ReviewCommentAnchor;
}

function safeSegment(value: string): string {
  return encodeURIComponent(value.trim() || "unknown");
}

export function reviewCommentIdentity(
  review: RepositoryReview | undefined,
): ReviewCommentIdentity {
  const workspace =
    review?.local.root ?? review?.repository?.slug ?? "local-workspace";
  const branch = review?.local.branch ?? review?.branch ?? "detached";
  const revision = review?.local.head ?? "working-tree";
  return {
    workspace,
    branch,
    revision,
    storageKey: `${REVIEW_COMMENT_STORAGE_PREFIX}:${safeSegment(workspace)}:${safeSegment(branch)}:${safeSegment(revision)}`,
  };
}

export function reviewRecordMatchesIdentity(
  identity: ReviewCommentIdentity,
  scope: ReviewRecordSnapshot["scope"],
): boolean {
  return (
    scope.repositoryRoot === identity.workspace &&
    scope.branch === identity.branch &&
    scope.head === identity.revision
  );
}

function patchLineKind(line: string): ReviewPatchLine["kind"] {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "addition";
  if (line.startsWith("-")) return "deletion";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  return "context";
}

export function parseReviewPatchLines(patch: string): ReviewPatchLine[] {
  let oldLine = 0;
  let newLine = 0;

  return patch.split("\n").map((line, index) => {
    const kind = patchLineKind(line);
    const key = `${index}:${line}`;

    if (kind === "hunk") {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      return { key, kind, line };
    }

    if (kind === "addition") {
      const anchor = {
        side: "new" as const,
        line: newLine,
        preview: line.slice(1, 241),
      };
      newLine += 1;
      return { key, kind, line, anchor };
    }

    if (kind === "deletion") {
      const anchor = {
        side: "old" as const,
        line: oldLine,
        preview: line.slice(1, 241),
      };
      oldLine += 1;
      return { key, kind, line, anchor };
    }

    if (kind === "context" && (oldLine > 0 || newLine > 0)) {
      const anchor = {
        side: "new" as const,
        line: newLine,
        preview: line.startsWith(" ") ? line.slice(1, 241) : line.slice(0, 240),
      };
      oldLine += 1;
      newLine += 1;
      return { key, kind, line, anchor };
    }

    return { key, kind, line };
  });
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.path !== "string" ||
    typeof record.body !== "string" ||
    (record.status !== "open" && record.status !== "resolved") ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return false;
  }
  if (record.anchor === undefined) return true;
  if (
    !record.anchor ||
    typeof record.anchor !== "object" ||
    Array.isArray(record.anchor)
  ) {
    return false;
  }
  const anchor = record.anchor as Record<string, unknown>;
  return (
    (anchor.side === "old" || anchor.side === "new") &&
    typeof anchor.line === "number" &&
    Number.isInteger(anchor.line) &&
    anchor.line >= 0 &&
    typeof anchor.preview === "string"
  );
}

export function loadReviewComments(
  identity: ReviewCommentIdentity,
  storage: ReviewCommentStorage,
): ReviewComment[] {
  try {
    const raw = storage.getItem(identity.storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReviewComment).map((comment) => ({
      ...comment,
      body: comment.body.slice(0, REVIEW_COMMENT_BODY_LIMIT),
      anchor: comment.anchor
        ? {
            ...comment.anchor,
            preview: comment.anchor.preview.slice(0, 240),
          }
        : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveReviewComments(
  identity: ReviewCommentIdentity,
  comments: readonly ReviewComment[],
  storage: ReviewCommentStorage,
): boolean {
  try {
    storage.setItem(identity.storageKey, JSON.stringify(comments));
    return true;
  } catch {
    return false;
  }
}

export function mergeReviewComments(
  local: readonly ReviewComment[],
  remote: readonly ReviewComment[],
): ReviewComment[] {
  const comments = new Map<string, ReviewComment>();
  for (const comment of [...local, ...remote]) {
    const existing = comments.get(comment.id);
    if (!existing || existing.updatedAt.localeCompare(comment.updatedAt) <= 0) {
      comments.set(comment.id, comment);
    }
  }
  return Array.from(comments.values()).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function createReviewComment(input: {
  id: string;
  path: string;
  body: string;
  anchor?: ReviewCommentAnchor;
  now: string;
}): ReviewComment {
  return {
    id: input.id,
    path: input.path,
    anchor: input.anchor,
    body: input.body.trim().slice(0, REVIEW_COMMENT_BODY_LIMIT),
    status: "open",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function compileReviewFeedback(input: {
  identity: ReviewCommentIdentity;
  comments: readonly ReviewComment[];
  limit?: number;
}): string {
  const limit = Math.max(1_000, input.limit ?? REVIEW_FEEDBACK_LIMIT);
  const openComments = input.comments
    .filter((comment) => comment.status === "open" && comment.body.trim())
    .slice(0, 50);
  const instruction = [
    "Apply the following human review feedback to the current workspace.",
    "Treat every comment as a requested code change. Inspect the referenced code before editing, preserve unrelated work, and report how each item was addressed.",
  ].join("\n");
  const feedbackTag = (count: number) =>
    `<review_feedback version="1" workspace="${escapeXml(input.identity.workspace.slice(0, 300))}" revision="${escapeXml(input.identity.revision.slice(0, 160))}" open_comments="${count}">`;
  const footer = "\n</review_feedback>";
  const blocks: string[] = [];
  let outputLength =
    instruction.length + feedbackTag(50).length + footer.length + 1;

  for (const comment of openComments) {
    const location = comment.anchor
      ? ` side="${comment.anchor.side}" line="${comment.anchor.line}"`
      : "";
    const preview = comment.anchor?.preview
      ? `\n<context>${escapeXml(comment.anchor.preview)}</context>`
      : "";
    const block = `\n<comment id="${escapeXml(comment.id.slice(0, 160))}" path="${escapeXml(comment.path.slice(0, 400))}"${location}>${preview}\n<request>${escapeXml(comment.body.slice(0, 1_400))}</request>\n</comment>`;
    if (outputLength + block.length > limit) break;
    blocks.push(block);
    outputLength += block.length;
  }

  return `${instruction}\n${feedbackTag(blocks.length)}${blocks.join("")}${footer}`;
}
