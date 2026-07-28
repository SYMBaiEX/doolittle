import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleWorkspaceRoutes } from "./workspace";

function createContext(): AppContext {
  return {
    services: {
      workspace: {
        tree: (depth: number) => [{ id: `tree:${depth}` }],
        read: (path: string) => `contents:${path}`,
        search: (query: string) => [{ query }],
        checkpointSupport: () => ({ supported: true }),
        listCheckpoints: () => [
          {
            id: "safe-1",
            label: "Before write",
            revision: "abc",
            createdAt: "2026-07-28T00:00:00.000Z",
          },
        ],
        createCheckpoint: (label?: string) => ({
          id: "new-1",
          label: label ?? "Operator checkpoint",
          revision: "def",
          createdAt: "2026-07-28T00:00:00.000Z",
        }),
        restoreCheckpoint: (id: string) => ({
          id,
          label: "Before write",
          revision: "abc",
          createdAt: "2026-07-28T00:00:00.000Z",
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleWorkspaceRoutes", () => {
  it("returns tree, read, and search payloads", async () => {
    const context = createContext();
    const tree = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/tree?depth=4"),
      new URL("http://localhost/workspace/tree?depth=4"),
    );
    const read = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/read?path=README.md"),
      new URL("http://localhost/workspace/read?path=README.md"),
    );
    const search = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/search?query=runtime"),
      new URL("http://localhost/workspace/search?query=runtime"),
    );

    await expect(tree?.json()).resolves.toEqual({
      entries: [{ id: "tree:4" }],
    });
    await expect(read?.json()).resolves.toEqual({
      path: "README.md",
      content: "contents:README.md",
    });
    await expect(search?.json()).resolves.toEqual({
      results: [{ query: "runtime" }],
    });
  });

  it("validates required workspace query parameters", async () => {
    const missingPath = await handleWorkspaceRoutes(
      createContext(),
      new Request("http://localhost/workspace/read"),
      new URL("http://localhost/workspace/read"),
    );
    const missingQuery = await handleWorkspaceRoutes(
      createContext(),
      new Request("http://localhost/workspace/search"),
      new URL("http://localhost/workspace/search"),
    );

    expect(missingPath?.status).toBe(400);
    await expect(missingPath?.json()).resolves.toEqual({
      error: "path is required",
    });
    expect(missingQuery?.status).toBe(400);
    await expect(missingQuery?.json()).resolves.toEqual({
      error: "query is required",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleWorkspaceRoutes(
      createContext(),
      new Request("http://localhost/not-workspace"),
      new URL("http://localhost/not-workspace"),
    );

    expect(response).toBeNull();
  });

  it("creates, lists, and only restores checkpoints with exact confirmation", async () => {
    const context = createContext();
    const listed = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/checkpoints"),
      new URL("http://localhost/workspace/checkpoints"),
    );
    const created = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/checkpoints", {
        method: "POST",
        body: JSON.stringify({ label: "Before operator change" }),
      }),
      new URL("http://localhost/workspace/checkpoints"),
    );
    const denied = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/checkpoints/safe-1/restore", {
        method: "POST",
        body: JSON.stringify({ confirmCheckpointId: "other" }),
      }),
      new URL("http://localhost/workspace/checkpoints/safe-1/restore"),
    );
    const restored = await handleWorkspaceRoutes(
      context,
      new Request("http://localhost/workspace/checkpoints/safe-1/restore", {
        method: "POST",
        body: JSON.stringify({ confirmCheckpointId: "safe-1" }),
      }),
      new URL("http://localhost/workspace/checkpoints/safe-1/restore"),
    );

    await expect(listed?.json()).resolves.toMatchObject({
      support: { supported: true },
      checkpoints: [{ id: "safe-1" }],
    });
    expect(created?.status).toBe(201);
    await expect(created?.json()).resolves.toMatchObject({
      checkpoint: { label: "Before operator change" },
    });
    expect(denied?.status).toBe(400);
    expect(restored?.status).toBe(200);
    await expect(restored?.json()).resolves.toMatchObject({
      restored: true,
      runtimeRestarted: false,
    });
  });
});
