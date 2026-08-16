import { describe, expect, it } from "vitest";
import type { RepositoryReview } from "../shared/contracts";
import {
  compileReviewFeedback,
  createReviewComment,
  loadReviewComments,
  mergeReviewComments,
  parseReviewPatchLines,
  type ReviewCommentStorage,
  reviewCommentIdentity,
  reviewRecordMatchesIdentity,
  saveReviewComments,
} from "./review-comments";

function memoryStorage(): ReviewCommentStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function repositoryReview(): RepositoryReview {
  return {
    state: "ready",
    local: {
      isRepository: true,
      root: "/work/doolittle",
      branch: "feature/review",
      head: "abc123",
      ahead: 1,
      behind: 0,
      dirty: true,
      changedFiles: 2,
    },
    branch: "feature/review",
    checks: [],
    workflowRuns: [],
    fetchedAt: "2026-07-27T12:00:00.000Z",
  };
}

describe("review comments", () => {
  it("scopes persisted drafts to the repository root, branch, and revision", () => {
    const first = reviewCommentIdentity(repositoryReview());
    const next = reviewCommentIdentity({
      ...repositoryReview(),
      local: { ...repositoryReview().local, head: "def456" },
    });
    const sameCommitOnAnotherBranch = reviewCommentIdentity({
      ...repositoryReview(),
      local: { ...repositoryReview().local, branch: "feature/other" },
    });

    expect(first.storageKey).not.toBe(next.storageKey);
    expect(first.storageKey).not.toBe(sameCommitOnAnotherBranch.storageKey);
    expect(first.workspace).toBe("/work/doolittle");
    expect(first.branch).toBe("feature/review");
    expect(first.revision).toBe("abc123");
  });

  it("does not merge or migrate a durable record from another branch", () => {
    const identity = reviewCommentIdentity(repositoryReview());

    expect(
      reviewRecordMatchesIdentity(identity, {
        repositoryRoot: "/work/doolittle",
        branch: "feature/review",
        head: "abc123",
      }),
    ).toBe(true);
    expect(
      reviewRecordMatchesIdentity(identity, {
        repositoryRoot: "/work/doolittle",
        branch: "feature/other",
        head: "abc123",
      }),
    ).toBe(false);
  });

  it("does not copy local drafts to another branch at the same commit", () => {
    const storage = memoryStorage();
    const source = reviewCommentIdentity(repositoryReview());
    const otherBranch = reviewCommentIdentity({
      ...repositoryReview(),
      local: { ...repositoryReview().local, branch: "feature/other" },
    });
    const comment = createReviewComment({
      id: "comment-1",
      path: "src/file.ts",
      body: "Keep this branch-specific.",
      now: "2026-07-27T12:00:00.000Z",
    });

    saveReviewComments(source, [comment], storage);

    expect(loadReviewComments(otherBranch, storage)).toEqual([]);
  });

  it("tracks old and new line anchors from unified diff hunks", () => {
    const lines = parseReviewPatchLines(
      [
        "diff --git a/file.ts b/file.ts",
        "@@ -10,3 +10,4 @@",
        " unchanged",
        "-old value",
        "+new value",
        "+another value",
      ].join("\n"),
    );

    expect(lines[2]?.anchor).toMatchObject({ side: "new", line: 10 });
    expect(lines[3]?.anchor).toMatchObject({ side: "old", line: 11 });
    expect(lines[4]?.anchor).toMatchObject({ side: "new", line: 11 });
    expect(lines[5]?.anchor).toMatchObject({ side: "new", line: 12 });
  });

  it("round trips valid drafts and ignores malformed stored values", () => {
    const storage = memoryStorage();
    const identity = reviewCommentIdentity(repositoryReview());
    const comment = createReviewComment({
      id: "comment-1",
      path: "src/file.ts",
      body: "  Handle the empty state.  ",
      now: "2026-07-27T12:00:00.000Z",
    });
    saveReviewComments(identity, [comment], storage);

    expect(loadReviewComments(identity, storage)).toEqual([
      { ...comment, body: "Handle the empty state." },
    ]);
    storage.setItem(identity.storageKey, "{broken");
    expect(loadReviewComments(identity, storage)).toEqual([]);
  });

  it("reports when local review-note persistence is unavailable", () => {
    const identity = reviewCommentIdentity(repositoryReview());
    const unavailableStorage: ReviewCommentStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage is disabled.", "SecurityError");
      },
    };

    expect(saveReviewComments(identity, [], unavailableStorage)).toBe(false);
  });

  it("compiles bounded, escaped, unresolved feedback for the next prompt", () => {
    const identity = reviewCommentIdentity(repositoryReview());
    const open = createReviewComment({
      id: "comment-1",
      path: "src/<file>.ts",
      body: "Guard x < 1 & explain why.",
      anchor: { side: "new", line: 42, preview: "if (x < 1) {" },
      now: "2026-07-27T12:00:00.000Z",
    });
    const resolved = { ...open, id: "comment-2", status: "resolved" as const };
    const feedback = compileReviewFeedback({
      identity,
      comments: [open, resolved],
      limit: 2_000,
    });

    expect(feedback).toContain('open_comments="1"');
    expect(feedback).toContain('path="src/&lt;file&gt;.ts"');
    expect(feedback).toContain('side="new" line="42"');
    expect(feedback).toContain("Guard x &lt; 1 &amp; explain why.");
    expect(feedback).not.toContain("comment-2");
    expect(feedback.length).toBeLessThanOrEqual(2_000);
  });

  it("keeps the newest version of each comment when durable records arrive", () => {
    const original = createReviewComment({
      id: "comment-1",
      path: "src/app.ts",
      body: "Use the empty state.",
      now: "2026-07-27T12:00:00.000Z",
    });
    const remote = {
      ...original,
      body: "Use the explicit empty state.",
      updatedAt: "2026-07-27T12:01:00.000Z",
    };

    expect(mergeReviewComments([original], [remote])).toEqual([remote]);
  });
});
