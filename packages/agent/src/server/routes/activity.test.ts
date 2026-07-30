import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleActivityRoutes } from "./activity";

function context(): AppContext {
  return {
    runtime: {
      getService: (name: string) =>
        name === "cron"
          ? {
              runs: () => [],
            }
          : null,
    },
    services: {
      runController: {
        listReceipts: () => [
          {
            runId: "run-1",
            sessionId: "session-1",
            roomId: "room-1",
            source: "desktop",
            message: "never expose me",
            runDepth: "root",
            configuredMaxIterations: 10,
            observedActionCount: 1,
            progressMode: "normal",
            status: "complete",
            localMutations: [],
            pendingApprovals: 0,
            startedAt: "2026-07-28T10:00:00.000Z",
            updatedAt: "2026-07-28T10:01:00.000Z",
          },
        ],
      },
      cron: {
        recentRuns: () => {
          throw new Error("legacy cron must not be used");
        },
      },
      delegationProjection: { list: () => [] },
      executionApprovals: { list: () => [] },
      delivery: { recent: () => [] },
    },
  } as unknown as AppContext;
}

describe("handleActivityRoutes", () => {
  it("returns the normalized activity payload", async () => {
    const response = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity?limit=1"),
      new URL("http://localhost/activity?limit=1"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      events: [
        {
          id: "chat-run:run-1",
          sourceId: "run-1",
          sessionId: "session-1",
          target: "chat",
          status: "succeeded",
        },
      ],
      updatedAt: "2026-07-28T10:01:00.000Z",
    });
  });

  it("rejects invalid limits and cursors", async () => {
    const invalidLimit = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity?limit=201"),
      new URL("http://localhost/activity?limit=201"),
    );
    const invalidCursor = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity?after=not-a-cursor"),
      new URL("http://localhost/activity?after=not-a-cursor"),
    );

    expect(invalidLimit?.status).toBe(400);
    await expect(invalidLimit?.json()).resolves.toEqual({
      error: "limit must be an integer from 1 to 200",
    });
    expect(invalidCursor?.status).toBe(400);
    await expect(invalidCursor?.json()).resolves.toEqual({
      error: "after cursor is invalid",
    });
  });

  it("ignores unrelated paths and rejects non-GET activity requests", async () => {
    await expect(
      handleActivityRoutes(
        context(),
        new Request("http://localhost/other"),
        new URL("http://localhost/other"),
      ),
    ).resolves.toBeNull();
    const response = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity", { method: "POST" }),
      new URL("http://localhost/activity"),
    );
    expect(response?.status).toBe(405);
  });

  it("returns a clear service error while the Trigger runtime is unavailable", async () => {
    const appContext = context();
    appContext.runtime = { getService: () => null } as never;

    const response = await handleActivityRoutes(
      appContext,
      new Request("http://localhost/activity"),
      new URL("http://localhost/activity"),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Trigger runtime service is not ready.",
    });
  });
});
