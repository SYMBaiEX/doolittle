import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSessionRoutes } from "@/server/routes/sessions";

function createContext() {
  return {
    services: {
      sessions: {
        listSessions: (limit: number) => [{ id: "session-1", limit }],
        rename: (sessionId: string, title: string) => ({ sessionId, title }),
        continuity: (sessionId: string) => [{ sessionId, next: "session-2" }],
        summarize: (sessionId: string) => ({ sessionId, summary: "ready" }),
      },
    },
  } as unknown as AppContext;
}

describe("handleSessionRoutes", () => {
  it("lists sessions with a validated limit", async () => {
    const response = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions?limit=3"),
      new URL("http://localhost/sessions?limit=3"),
    );

    await expect(response?.json()).resolves.toEqual({
      sessions: [{ id: "session-1", limit: 3 }],
    });
  });

  it("validates title updates and session lookups", async () => {
    const renameBad = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/title", {
        method: "POST",
        body: JSON.stringify({ title: "Missing id" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/title"),
    );
    const renameGood = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/title", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1", title: "Focus" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/title"),
    );
    const continuity = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/continuity?sessionId=session-1"),
      new URL("http://localhost/sessions/continuity?sessionId=session-1"),
    );
    const summary = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/summary?sessionId=session-1"),
      new URL("http://localhost/sessions/summary?sessionId=session-1"),
    );

    expect(renameBad?.status).toBe(400);
    await expect(renameGood?.json()).resolves.toEqual({
      summary: { sessionId: "session-1", title: "Focus" },
    });
    await expect(continuity?.json()).resolves.toEqual({
      sessions: [{ sessionId: "session-1", next: "session-2" }],
    });
    await expect(summary?.json()).resolves.toEqual({
      summary: { sessionId: "session-1", summary: "ready" },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/not-sessions"),
      new URL("http://localhost/not-sessions"),
    );

    expect(response).toBeNull();
  });
});
