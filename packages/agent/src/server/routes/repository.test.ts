import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRepositoryRoutes } from "./repository";

function createContext(): AppContext {
  return {
    services: {
      repository: {
        status: async () => ({ clean: true }),
        diffStat: async () => ({ files: 2 }),
        recentCommits: async () => [{ sha: "abc123" }],
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

  it("returns null for unrelated routes", async () => {
    const response = await handleRepositoryRoutes(
      createContext(),
      new Request("http://localhost/not-repo"),
      new URL("http://localhost/not-repo"),
    );

    expect(response).toBeNull();
  });
});
