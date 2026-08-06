import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type {
  ReviewRecord,
  ReviewRecordAnchor,
  ReviewRecordComment,
  ReviewRecordCommentStatus,
  ReviewRecordEvent,
  ReviewRecordEventType,
  ReviewRecordPage,
  ReviewRecordScope,
} from "./types";

const MAX_RECORDS = 100;
const MAX_COMMENTS = 500;
const MAX_EVENTS = 1_000;
const MAX_BODY_LENGTH = 2_000;
const MAX_PATH_LENGTH = 1_024;
const MAX_DETAIL_LENGTH = 320;
const MAX_ANCHOR_PREVIEW_LENGTH = 240;
const MAX_PAGE_LIMIT = 200;

interface PersistedReviewRecords {
  records: ReviewRecord[];
}

function safeString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function normalizeRoot(value: string): string {
  return normalize(resolve(value));
}

export function normalizeReviewRecordScope(
  input: ReviewRecordScope,
): ReviewRecordScope {
  const repositoryRoot = safeString(input.repositoryRoot, 4_096);
  const branch = safeString(input.branch, 255);
  const head = safeString(input.head, 160);
  if (!repositoryRoot || !branch || !head) {
    throw new Error("A repository root, branch, and revision are required.");
  }
  return { repositoryRoot: normalizeRoot(repositoryRoot), branch, head };
}

function sameScope(left: ReviewRecordScope, right: ReviewRecordScope): boolean {
  return (
    left.repositoryRoot === right.repositoryRoot &&
    left.branch === right.branch &&
    left.head === right.head
  );
}

function cloneRecord(record: ReviewRecord): ReviewRecord {
  return JSON.parse(JSON.stringify(record)) as ReviewRecord;
}

function eventDetail(
  type: ReviewRecordEventType,
  comment?: ReviewRecordComment,
): string {
  if (type === "feedback_sent")
    return "Sent unresolved review feedback to the agent.";
  if (!comment) return "Updated a review comment.";
  const target = comment.anchor
    ? `${comment.path}:${comment.anchor.line}`
    : comment.path;
  const verb: Record<
    Exclude<ReviewRecordEventType, "feedback_sent">,
    string
  > = {
    comment_created: "Added",
    comment_edited: "Edited",
    comment_resolved: "Resolved",
    comment_reopened: "Reopened",
    comment_deleted: "Deleted",
  };
  return `${verb[type]} review feedback on ${target}.`.slice(
    0,
    MAX_DETAIL_LENGTH,
  );
}

function validAnchor(value: unknown): ReviewRecordAnchor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const preview = safeString(record.preview, MAX_ANCHOR_PREVIEW_LENGTH);
  if (
    (record.side !== "old" && record.side !== "new") ||
    !Number.isSafeInteger(record.line) ||
    (record.line as number) < 0 ||
    !preview
  ) {
    return undefined;
  }
  return { side: record.side, line: record.line as number, preview };
}

function validComment(value: unknown): ReviewRecordComment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const id = safeString(record.id, 160);
  const path = safeString(record.path, MAX_PATH_LENGTH);
  const body = safeString(record.body, MAX_BODY_LENGTH);
  const createdAt = safeString(record.createdAt, 80);
  const updatedAt = safeString(record.updatedAt, 80);
  if (
    !id ||
    !path ||
    !body ||
    !createdAt ||
    !updatedAt ||
    (record.status !== "open" && record.status !== "resolved")
  ) {
    return undefined;
  }
  const anchor =
    record.anchor === undefined ? undefined : validAnchor(record.anchor);
  if (record.anchor !== undefined && !anchor) return undefined;
  return {
    id,
    path,
    body,
    createdAt,
    updatedAt,
    status: record.status,
    anchor,
  };
}

function validRecord(value: unknown): ReviewRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  try {
    const scope = normalizeReviewRecordScope(record.scope as ReviewRecordScope);
    const comments = Array.isArray(record.comments)
      ? record.comments
          .map(validComment)
          .filter((item): item is ReviewRecordComment => Boolean(item))
          .slice(-MAX_COMMENTS)
      : [];
    const events = Array.isArray(record.events)
      ? record.events
          .filter((event): event is ReviewRecordEvent => {
            if (!event || typeof event !== "object" || Array.isArray(event))
              return false;
            const item = event as Record<string, unknown>;
            return (
              typeof item.id === "string" &&
              typeof item.createdAt === "string" &&
              typeof item.detail === "string" &&
              [
                "comment_created",
                "comment_edited",
                "comment_resolved",
                "comment_reopened",
                "comment_deleted",
                "feedback_sent",
              ].includes(String(item.type))
            );
          })
          .slice(-MAX_EVENTS)
      : [];
    return {
      scope,
      comments,
      events,
      updatedAt: safeString(record.updatedAt, 80) ?? new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

export class ReviewRecordService {
  private readonly filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "review-records.json");
    if (!existsSync(this.filePath)) this.write({ records: [] });
  }

  list(
    scopeInput: ReviewRecordScope,
    options: { cursor?: string; limit?: number } = {},
  ): ReviewRecordPage {
    const record = this.get(scopeInput);
    const entries = [...record.comments, ...record.events].sort(
      (left, right) => {
        const leftAt = "updatedAt" in left ? left.updatedAt : left.createdAt;
        const rightAt =
          "updatedAt" in right ? right.updatedAt : right.createdAt;
        return rightAt.localeCompare(leftAt);
      },
    );
    const start = Math.max(0, Number.parseInt(options.cursor ?? "0", 10) || 0);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, options.limit ?? 100));
    const page = entries.slice(start, start + limit);
    return {
      record,
      entries: page,
      nextCursor:
        start + page.length < entries.length
          ? String(start + page.length)
          : undefined,
    };
  }

  get(scopeInput: ReviewRecordScope): ReviewRecord {
    const scope = normalizeReviewRecordScope(scopeInput);
    const found = this.read().records.find((record) =>
      sameScope(record.scope, scope),
    );
    return found
      ? cloneRecord(found)
      : {
          scope,
          comments: [],
          events: [],
          updatedAt: new Date(0).toISOString(),
        };
  }

  createComment(
    scopeInput: ReviewRecordScope,
    input: Omit<ReviewRecordComment, "status" | "updatedAt">,
  ): ReviewRecord {
    const comment = validComment({
      ...input,
      status: "open",
      updatedAt: input.createdAt,
    });
    if (!comment) throw new Error("Review comment is invalid.");
    return this.update(scopeInput, (record) => {
      if (record.comments.some((item) => item.id === comment.id)) return record;
      record.comments = [...record.comments, comment].slice(-MAX_COMMENTS);
      this.addEvent(record, "comment_created", comment);
      return record;
    });
  }

  migrateComments(
    scopeInput: ReviewRecordScope,
    comments: readonly ReviewRecordComment[],
  ): ReviewRecord {
    return this.update(scopeInput, (record) => {
      for (const input of comments.slice(-MAX_COMMENTS)) {
        const comment = validComment(input);
        if (!comment) continue;
        const existing = record.comments.find((item) => item.id === comment.id);
        if (existing) {
          if (existing.updatedAt.localeCompare(comment.updatedAt) >= 0)
            continue;
          Object.assign(existing, comment);
          this.addEvent(record, "comment_edited", comment);
          continue;
        }
        record.comments.push(comment);
        this.addEvent(record, "comment_created", comment);
      }
      record.comments = record.comments.slice(-MAX_COMMENTS);
      return record;
    });
  }

  updateComment(
    scopeInput: ReviewRecordScope,
    id: string,
    body: string,
  ): ReviewRecord {
    const nextBody = safeString(body, MAX_BODY_LENGTH);
    if (!nextBody) throw new Error("Review comment body is required.");
    return this.update(scopeInput, (record) => {
      const comment = this.requireComment(record, id);
      comment.body = nextBody;
      comment.updatedAt = new Date().toISOString();
      this.addEvent(record, "comment_edited", comment);
      return record;
    });
  }

  setCommentStatus(
    scopeInput: ReviewRecordScope,
    id: string,
    status: ReviewRecordCommentStatus,
  ): ReviewRecord {
    return this.update(scopeInput, (record) => {
      const comment = this.requireComment(record, id);
      if (comment.status === status) return record;
      comment.status = status;
      comment.updatedAt = new Date().toISOString();
      this.addEvent(
        record,
        status === "resolved" ? "comment_resolved" : "comment_reopened",
        comment,
      );
      return record;
    });
  }

  deleteComment(scopeInput: ReviewRecordScope, id: string): ReviewRecord {
    return this.update(scopeInput, (record) => {
      const comment = this.requireComment(record, id);
      record.comments = record.comments.filter(
        (item) => item.id !== comment.id,
      );
      this.addEvent(record, "comment_deleted", comment);
      return record;
    });
  }

  recordFeedbackSent(scopeInput: ReviewRecordScope): ReviewRecord {
    return this.update(scopeInput, (record) => {
      this.addEvent(record, "feedback_sent");
      return record;
    });
  }

  private update(
    scopeInput: ReviewRecordScope,
    apply: (record: ReviewRecord) => ReviewRecord,
  ): ReviewRecord {
    const scope = normalizeReviewRecordScope(scopeInput);
    const store = this.read();
    const existing = store.records.find((record) =>
      sameScope(record.scope, scope),
    );
    const record = existing
      ? cloneRecord(existing)
      : {
          scope,
          comments: [],
          events: [],
          updatedAt: new Date(0).toISOString(),
        };
    const next = apply(record);
    next.updatedAt = new Date().toISOString();
    store.records = [
      ...store.records.filter((item) => !sameScope(item.scope, scope)),
      next,
    ].slice(-MAX_RECORDS);
    this.write(store);
    return cloneRecord(next);
  }

  private requireComment(
    record: ReviewRecord,
    id: string,
  ): ReviewRecordComment {
    const comment = record.comments.find((item) => item.id === id);
    if (!comment)
      throw new Error("Review comment was not found for this branch revision.");
    return comment;
  }

  private addEvent(
    record: ReviewRecord,
    type: ReviewRecordEventType,
    comment?: ReviewRecordComment,
  ): void {
    record.events = [
      ...record.events,
      {
        id: randomUUID(),
        type,
        commentId: comment?.id,
        detail: eventDetail(type, comment),
        createdAt: new Date().toISOString(),
      },
    ].slice(-MAX_EVENTS);
  }

  private read(): PersistedReviewRecords {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as {
        records?: unknown;
      };
      return {
        records: Array.isArray(raw.records)
          ? raw.records
              .map(validRecord)
              .filter((record): record is ReviewRecord => Boolean(record))
              .slice(-MAX_RECORDS)
          : [],
      };
    } catch {
      return { records: [] };
    }
  }

  private write(value: PersistedReviewRecords): void {
    writeJsonAtomicSync(this.filePath, value);
  }
}
