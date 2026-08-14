import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { ReviewRecordService } from "@/services/review-record";
import { handleReviewRecordRoutes } from "./review-record";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createContext(): AppContext {
  const directory = mkdtempSync(
    join(tmpdir(), "doolittle-review-record-route-"),
  );
  directories.push(directory);
  return {
    config: { workspaceDir: "/work/doolittle" },
    services: {
      repository: {
        summary: async () => ({
          isRepository: true,
          root: "/work/doolittle",
          branch: "feature/review",
          head: "abc123",
          ahead: 0,
          behind: 0,
          dirty: false,
          changedFiles: 0,
        }),
      },
      reviewRecords: new ReviewRecordService(directory),
    },
  } as unknown as AppContext;
}

async function route(context: AppContext, path: string, init?: RequestInit) {
  const request = new Request(`http://localhost${path}`, init);
  return handleReviewRecordRoutes(context, request, new URL(request.url));
}

describe("handleReviewRecordRoutes", () => {
  it("stores lifecycle actions in the server-derived branch record", async () => {
    const context = createContext();
    const created = await route(context, "/review-record/comments", {
      method: "POST",
      body: JSON.stringify({
        comment: {
          id: "comment-1",
          path: "src/app.ts",
          body: "Handle empty state.",
        },
      }),
    });
    const resolved = await route(
      context,
      "/review-record/comments/comment-1/resolve",
      { method: "POST" },
    );
    const reopened = await route(
      context,
      "/review-record/comments/comment-1/reopen",
      { method: "POST" },
    );
    const edited = await route(context, "/review-record/comments/comment-1", {
      method: "PATCH",
      body: JSON.stringify({ body: "Handle the empty state clearly." }),
    });
    const feedback = await route(context, "/review-record/feedback-sent", {
      method: "POST",
    });

    expect(created?.status).toBe(201);
    await expect(resolved?.json()).resolves.toMatchObject({
      record: { comments: [{ status: "resolved" }] },
    });
    await expect(reopened?.json()).resolves.toMatchObject({
      record: { comments: [{ status: "open" }] },
    });
    await expect(edited?.json()).resolves.toMatchObject({
      record: { comments: [{ body: "Handle the empty state clearly." }] },
    });
    await expect(feedback?.json()).resolves.toMatchObject({
      record: {
        events: [
          { type: "comment_created" },
          { type: "comment_resolved" },
          { type: "comment_reopened" },
          { type: "comment_edited" },
          { type: "feedback_sent" },
        ],
      },
    });
  });

  it("migrates a legacy local comment once and exposes bounded records", async () => {
    const context = createContext();
    const migrated = await route(context, "/review-record/comments/migrate", {
      method: "POST",
      body: JSON.stringify({
        comments: [
          {
            id: "legacy-1",
            path: "src/a.ts",
            body: "Keep this shortcut.",
            status: "resolved",
            createdAt: "2026-07-27T12:00:00.000Z",
            updatedAt: "2026-07-27T12:00:00.000Z",
          },
        ],
      }),
    });
    const secondMigration = await route(
      context,
      "/review-record/comments/migrate",
      {
        method: "POST",
        body: JSON.stringify({
          comments: [
            {
              id: "legacy-1",
              path: "src/a.ts",
              body: "Keep this shortcut.",
              status: "resolved",
              createdAt: "2026-07-27T12:00:00.000Z",
              updatedAt: "2026-07-27T12:00:00.000Z",
            },
          ],
        }),
      },
    );
    const page = await route(context, "/review-record?limit=1");

    await expect(migrated?.json()).resolves.toMatchObject({
      record: { comments: [{ id: "legacy-1", status: "resolved" }] },
    });
    await expect(secondMigration?.json()).resolves.toMatchObject({
      record: { events: [{ type: "comment_created" }] },
    });
    await expect(page?.json()).resolves.toMatchObject({
      record: { scope: { branch: "feature/review", head: "abc123" } },
      entries: [{ id: expect.any(String) }],
    });
  });

  it("rejects malformed actions without accepting caller supplied scope", async () => {
    const response = await route(createContext(), "/review-record/comments", {
      method: "POST",
      body: JSON.stringify({
        comment: { path: "src/a.ts", body: "" },
        repositoryRoot: "/not/used",
      }),
    });
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "A valid review comment is required.",
    });
  });

  it("rejects malformed mutation bodies before touching the record", async () => {
    const malformed = await route(createContext(), "/review-record/comments", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });
    const array = await route(
      createContext(),
      "/review-record/comments/migrate",
      {
        method: "POST",
        body: "[]",
        headers: { "content-type": "application/json" },
      },
    );

    expect(malformed?.status).toBe(400);
    await expect(malformed?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(array?.status).toBe(400);
    await expect(array?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
  });

  it("returns a bounded client error for malformed comment identifiers", async () => {
    const context = createContext();
    const paths = [
      ["PATCH", "/review-record/comments/%E0%A4"],
      ["DELETE", "/review-record/comments/%E0%A4"],
      ["POST", "/review-record/comments/%E0%A4/resolve"],
    ] as const;

    for (const [method, path] of paths) {
      const response = await route(context, path, {
        method,
        ...(method === "PATCH"
          ? {
              body: JSON.stringify({ body: "updated" }),
              headers: { "content-type": "application/json" },
            }
          : {}),
      });

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({
        error: "Review comment identifier is invalid.",
      });
    }
  });

  it("decodes valid encoded comment identifiers before mutation", async () => {
    const context = createContext();
    const created = await route(context, "/review-record/comments", {
      method: "POST",
      body: JSON.stringify({
        comment: {
          id: "comment/one",
          path: "src/app.ts",
          body: "Keep this context.",
        },
      }),
    });
    expect(created?.status).toBe(201);

    const resolved = await route(
      context,
      "/review-record/comments/comment%2Fone/resolve",
      { method: "POST" },
    );

    expect(resolved?.status).toBe(200);
    await expect(resolved?.json()).resolves.toMatchObject({
      record: { comments: [{ id: "comment/one", status: "resolved" }] },
    });
  });
});
