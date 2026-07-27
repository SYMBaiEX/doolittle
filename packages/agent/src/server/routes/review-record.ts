import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type {
  ReviewRecordComment,
  ReviewRecordScope,
} from "@/services/review-record";

const MAX_COMMENT_BODY_LENGTH = 2_000;
const MAX_COMMENT_PATH_LENGTH = 1_024;
const MAX_MIGRATION_COMMENTS = 500;

function boundedLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 100;
}

function stringValue(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

async function currentScope(context: AppContext): Promise<ReviewRecordScope> {
  const repository = await context.services.repository.summary();
  return {
    repositoryRoot: repository.root ?? context.config.workspaceDir,
    branch: repository.branch ?? "detached",
    head: repository.head ?? "working-tree",
  };
}

function requestComment(
  value: unknown,
): Omit<ReviewRecordComment, "status" | "updatedAt"> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id, 160) ?? randomUUID();
  const path = stringValue(record.path, MAX_COMMENT_PATH_LENGTH);
  const body = stringValue(record.body, MAX_COMMENT_BODY_LENGTH);
  const createdAt =
    stringValue(record.createdAt, 80) ?? new Date().toISOString();
  if (!path || !body) return undefined;
  const anchor = record.anchor;
  if (anchor === undefined) return { id, path, body, createdAt };
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor))
    return undefined;
  const anchorRecord = anchor as Record<string, unknown>;
  const preview = stringValue(anchorRecord.preview, 240);
  if (
    (anchorRecord.side !== "old" && anchorRecord.side !== "new") ||
    !Number.isSafeInteger(anchorRecord.line) ||
    (anchorRecord.line as number) < 0 ||
    !preview
  ) {
    return undefined;
  }
  return {
    id,
    path,
    body,
    createdAt,
    anchor: {
      side: anchorRecord.side,
      line: anchorRecord.line as number,
      preview,
    },
  };
}

function responseError(error: unknown): Response {
  return json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Review record request failed.",
    },
    400,
  );
}

export async function handleReviewRecordRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    url.pathname !== "/review-record" &&
    !url.pathname.startsWith("/review-record/")
  ) {
    return null;
  }

  try {
    const scope = await currentScope(context);
    if (request.method === "GET" && url.pathname === "/review-record") {
      const page = context.services.reviewRecords.list(scope, {
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: boundedLimit(url.searchParams.get("limit")),
      });
      return json(page);
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      request.method === "POST" &&
      url.pathname === "/review-record/comments"
    ) {
      const comment = requestComment(body.comment);
      if (!comment)
        return json({ error: "A valid review comment is required." }, 400);
      return json(
        {
          record: context.services.reviewRecords.createComment(scope, comment),
        },
        201,
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/review-record/comments/migrate"
    ) {
      const comments = Array.isArray(body.comments)
        ? body.comments.slice(-MAX_MIGRATION_COMMENTS).flatMap((value) => {
            const comment = requestComment(value);
            if (!comment) return [];
            const source = value as Record<string, unknown>;
            return [
              {
                ...comment,
                status:
                  source.status === "resolved"
                    ? ("resolved" as const)
                    : ("open" as const),
                updatedAt:
                  stringValue(source.updatedAt, 80) ?? comment.createdAt,
              },
            ];
          })
        : [];
      return json({
        record: context.services.reviewRecords.migrateComments(scope, comments),
      });
    }

    const commentMatch = /^\/review-record\/comments\/([^/]+)$/u.exec(
      url.pathname,
    );
    if (commentMatch && request.method === "PATCH") {
      const id = decodeURIComponent(commentMatch[1] ?? "");
      const nextBody = stringValue(body.body, MAX_COMMENT_BODY_LENGTH);
      if (!nextBody)
        return json({ error: "Review comment body is required." }, 400);
      return json({
        record: context.services.reviewRecords.updateComment(
          scope,
          id,
          nextBody,
        ),
      });
    }
    if (commentMatch && request.method === "DELETE") {
      const id = decodeURIComponent(commentMatch[1] ?? "");
      return json({
        record: context.services.reviewRecords.deleteComment(scope, id),
      });
    }

    const statusMatch =
      /^\/review-record\/comments\/([^/]+)\/(resolve|reopen)$/u.exec(
        url.pathname,
      );
    if (statusMatch && request.method === "POST") {
      const id = decodeURIComponent(statusMatch[1] ?? "");
      const status = statusMatch[2] === "resolve" ? "resolved" : "open";
      return json({
        record: context.services.reviewRecords.setCommentStatus(
          scope,
          id,
          status,
        ),
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/review-record/feedback-sent"
    ) {
      return json({
        record: context.services.reviewRecords.recordFeedbackSent(scope),
      });
    }
  } catch (error) {
    return responseError(error);
  }
  return null;
}
