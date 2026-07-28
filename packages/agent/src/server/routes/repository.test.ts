import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRepositoryRoutes } from "./repository";

function createContext(): AppContext {
  return {
    services: {
      repository: {
        status: async () => ({ clean: true }),
        diffStat: async () => ({ files: 2 }),
        recentCommits: async () => [{ sha: "abc123" }],
        summary: async () => ({
          isRepository: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          dirty: true,
          changedFiles: 1,
        }),
        review: async () => ({
          state: "ready",
          local: {
            isRepository: true,
            branch: "main",
            ahead: 0,
            behind: 0,
            dirty: true,
            changedFiles: 1,
          },
          repository: {
            host: "github.com",
            owner: "elizaOS",
            name: "doolittle",
            slug: "elizaOS/doolittle",
            url: "https://github.com/elizaOS/doolittle",
          },
          branch: "main",
          checks: [],
          workflowRuns: [],
          fetchedAt: "2026-07-27T13:00:00.000Z",
        }),
        changes: async () => [{ path: "src/index.ts", unstaged: true }],
        patch: async (path?: string, staged?: boolean) => ({
          path,
          staged: Boolean(staged),
          patch: "@@ -1 +1 @@",
          truncated: false,
        }),
        worktrees: async () => [
          { path: "/tmp/repo", branch: "main", detached: false },
        ],
        createWorktree: async (input: { branch: string; path: string }) => ({
          ...input,
          head: "abc123",
          detached: false,
          bare: false,
          prunable: false,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleRepositoryRoutes", () => {
  it("returns repository status, diff, and log payloads", async () => {
    const context = createContext();
    const status = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/status"),
      new URL("http://localhost/repo/status"),
    );
    const diff = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/diff"),
      new URL("http://localhost/repo/diff"),
    );
    const log = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/log"),
      new URL("http://localhost/repo/log"),
    );

    await expect(status?.json()).resolves.toEqual({
      status: { clean: true },
    });
    await expect(diff?.json()).resolves.toEqual({
      diff: { files: 2 },
    });
    await expect(log?.json()).resolves.toEqual({
      log: [{ sha: "abc123" }],
    });
  });

  it("returns review-grade repository read models", async () => {
    const context = createContext();
    const summary = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/summary"),
      new URL("http://localhost/repo/summary"),
    );
    const changes = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/changes"),
      new URL("http://localhost/repo/changes"),
    );
    const patch = await handleRepositoryRoutes(
      context,
      new Request(
        "http://localhost/repo/patch?path=src%2Findex.ts&staged=true",
      ),
      new URL("http://localhost/repo/patch?path=src%2Findex.ts&staged=true"),
    );
    const worktrees = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/worktrees"),
      new URL("http://localhost/repo/worktrees"),
    );
    const review = await handleRepositoryRoutes(
      context,
      new Request("http://localhost/repo/review"),
      new URL("http://localhost/repo/review"),
    );

    await expect(summary?.json()).resolves.toMatchObject({
      summary: { branch: "main", changedFiles: 1 },
    });
    await expect(changes?.json()).resolves.toEqual({
      changes: [{ path: "src/index.ts", unstaged: true }],
    });
    await expect(patch?.json()).resolves.toMatchObject({
      patch: { path: "src/index.ts", staged: true },
    });
    await expect(worktrees?.json()).resolves.toMatchObject({
      worktrees: [{ branch: "main" }],
    });
    await expect(review?.json()).resolves.toMatchObject({
      review: {
        state: "ready",
        repository: { slug: "elizaOS/doolittle" },
        local: { branch: "main", changedFiles: 1 },
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleRepositoryRoutes(
      createContext(),
      new Request("http://localhost/not-repo"),
      new URL("http://localhost/not-repo"),
    );

    expect(response).toBeNull();
  });

  it("creates a worktree only through the explicit create route", async () => {
    const response = await handleRepositoryRoutes(
      createContext(),
      new Request("http://localhost/repo/worktrees/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branch: "feature/desktop",
          path: ".worktrees/desktop",
        }),
      }),
      new URL("http://localhost/repo/worktrees/create"),
    );

    expect(response?.status).toBe(201);
    await expect(response?.json()).resolves.toMatchObject({
      worktree: {
        branch: "feature/desktop",
        path: ".worktrees/desktop",
        detached: false,
      },
    });
  });

  it("rejects malformed worktree create payloads", async () => {
    const response = await handleRepositoryRoutes(
      createContext(),
      new Request("http://localhost/repo/worktrees/create", {
        method: "POST",
        body: "{}",
      }),
      new URL("http://localhost/repo/worktrees/create"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "branch and path are required",
    });
  });
});
