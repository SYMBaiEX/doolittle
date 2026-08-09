import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleActivityRoutes } from "./activity";

function context(): AppContext {
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "cron") {
          return {
            runs: () => [],
          };
        }
        if (name === "ORCHESTRATOR_TASK_SERVICE") {
          return {
            listTasks: async () => [],
            getTask: async () => null,
          };
        }
        return null;
      },
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
      executionApprovals: { list: () => [] },
      delivery: { recent: () => [] },
      terminal: { recent: () => [] },
      logger: { list: () => [] },
      autocoderPipeline: { list: () => [] },
      repository: { changes: async () => [] },
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

  it("accepts the bounded parity kinds and targets", async () => {
    const response = await handleActivityRoutes(
      context(),
      new Request(
        "http://localhost/activity?kind=repository-change&target=workspace",
      ),
      new URL(
        "http://localhost/activity?kind=repository-change&target=workspace",
      ),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ events: [] });
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

    const invalidFilter = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity?kind=unrecognized"),
      new URL("http://localhost/activity?kind=unrecognized"),
    );
    expect(invalidFilter?.status).toBe(400);
    await expect(invalidFilter?.json()).resolves.toEqual({
      error: "kind is invalid",
    });

    for (const path of [
      "/activity?raw=true",
      "/activity?kind=approval&kind=delivery",
      `/activity?after=${"a".repeat(1_025)}`,
    ]) {
      const rejected = await handleActivityRoutes(
        context(),
        new Request(`http://localhost${path}`),
        new URL(`http://localhost${path}`),
      );
      expect(rejected?.status).toBe(400);
    }
  });

  it("exports the redacted bounded operator timeline", async () => {
    const response = await handleActivityRoutes(
      context(),
      new Request("http://localhost/activity/export?target=chat"),
      new URL("http://localhost/activity/export?target=chat"),
    );

    expect(response?.status).toBe(200);
    const payload = await response?.json();
    expect(payload).toMatchObject({
      schemaVersion: 1,
      redaction: "summary-only",
      events: [expect.objectContaining({ kind: "chat-run", target: "chat" })],
    });
    const serialized = JSON.stringify(payload);
    for (const identifier of ["run-1", "session-1", "room-1"]) {
      expect(serialized).not.toContain(identifier);
    }
    expect(serialized).not.toContain("never expose me");
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
