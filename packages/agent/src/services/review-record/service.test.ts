import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewRecordService } from "./service";
import type { ReviewRecordScope } from "./types";

const scope: ReviewRecordScope = {
  repositoryRoot: "/work/doolittle/../doolittle",
  branch: "feature/review",
  head: "abc123",
};

function withService(run: (service: ReviewRecordService) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-review-record-"));
  try {
    run(new ReviewRecordService(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("ReviewRecordService", () => {
  it("persists a branch-and-revision scoped comment timeline", () => {
    withService((service) => {
      const created = service.createComment(scope, {
        id: "comment-1",
        path: "src/index.ts",
        body: "Handle empty input.",
        createdAt: "2026-07-27T12:00:00.000Z",
        anchor: { side: "new", line: 42, preview: "if (!input)" },
      });
      const resolved = service.setCommentStatus(scope, "comment-1", "resolved");
      const reopened = service.setCommentStatus(scope, "comment-1", "open");
      const updated = service.updateComment(
        scope,
        "comment-1",
        "Handle empty input safely.",
      );
      const afterFeedback = service.recordFeedbackSent(scope);

      expect(created.scope.repositoryRoot).toBe("/work/doolittle");
      expect(resolved.comments[0]?.status).toBe("resolved");
      expect(reopened.comments[0]?.status).toBe("open");
      expect(updated.comments[0]?.body).toBe("Handle empty input safely.");
      expect(afterFeedback.events.map((event) => event.type)).toEqual([
        "comment_created",
        "comment_resolved",
        "comment_reopened",
        "comment_edited",
        "feedback_sent",
      ]);
    });
  });

  it("migrates legacy comments idempotently and isolates other revisions", () => {
    withService((service) => {
      const comment = {
        id: "legacy-comment",
        path: "src/app.ts",
        body: "Keep the keyboard shortcut.",
        status: "open" as const,
        createdAt: "2026-07-27T12:00:00.000Z",
        updatedAt: "2026-07-27T12:00:00.000Z",
      };
      service.migrateComments(scope, [comment]);
      const migrated = service.migrateComments(scope, [comment]);
      const otherRevision = service.get({ ...scope, head: "def456" });

      expect(migrated.comments).toEqual([comment]);
      expect(migrated.events).toHaveLength(1);
      expect(otherRevision.comments).toEqual([]);
    });
  });

  it("preserves a newer offline draft when migration meets the same comment id", () => {
    withService((service) => {
      service.migrateComments(scope, [
        {
          id: "comment-1",
          path: "src/app.ts",
          body: "First version.",
          status: "open",
          createdAt: "2026-07-27T12:00:00.000Z",
          updatedAt: "2026-07-27T12:00:00.000Z",
        },
      ]);
      const migrated = service.migrateComments(scope, [
        {
          id: "comment-1",
          path: "src/app.ts",
          body: "Edited while offline.",
          status: "resolved",
          createdAt: "2026-07-27T12:00:00.000Z",
          updatedAt: "2026-07-27T12:05:00.000Z",
        },
      ]);

      expect(migrated.comments).toMatchObject([
        { body: "Edited while offline.", status: "resolved" },
      ]);
      expect(migrated.events.at(-1)?.type).toBe("comment_edited");
    });
  });

  it("bounds pages and rejects updates outside the current branch record", () => {
    withService((service) => {
      for (let index = 0; index < 3; index += 1) {
        service.createComment(scope, {
          id: `comment-${index}`,
          path: `src/${index}.ts`,
          body: `Review ${index}`,
          createdAt: `2026-07-27T12:00:0${index}.000Z`,
        });
      }
      const page = service.list(scope, { limit: 2 });
      expect(page.entries).toHaveLength(2);
      expect(page.nextCursor).toBe("2");
      expect(() =>
        service.deleteComment({ ...scope, head: "other" }, "comment-0"),
      ).toThrow("was not found");
    });
  });
});
