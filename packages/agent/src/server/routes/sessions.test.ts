import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSessionRoutes } from "@/server/routes/sessions";

function createContext() {
  return {
    services: {
      sessions: {
        listSessions: (limit: number) => [{ id: "session-1", limit }],
        search: (query: string, limit: number) => [{ query, limit }],
        rename: (sessionId: string, title: string) => ({ sessionId, title }),
        continuity: (sessionId: string) => [{ sessionId, next: "session-2" }],
        summarize: (sessionId: string) => ({ sessionId, summary: "ready" }),
        usage: (sessionId: string) => ({ sessionId, tokens: 42 }),
        messagesBySession: (sessionId: string, limit: number) => [
          { sessionId, limit, role: "assistant", text: "Ready" },
        ],
      },
      settings: {
        get: () => ({
          model: {
            provider: "ollama",
            model: "granite4.1:3b",
          },
        }),
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
    const usage = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/usage?sessionId=session-1"),
      new URL("http://localhost/sessions/usage?sessionId=session-1"),
    );
    const messages = await handleSessionRoutes(
      createContext(),
      new Request(
        "http://localhost/sessions/messages?sessionId=session-1&limit=999",
      ),
      new URL(
        "http://localhost/sessions/messages?sessionId=session-1&limit=999",
      ),
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
    await expect(usage?.json()).resolves.toEqual({
      usage: { sessionId: "session-1", tokens: 42 },
    });
    await expect(messages?.json()).resolves.toEqual({
      messages: [
        {
          sessionId: "session-1",
          limit: 500,
          role: "assistant",
          text: "Ready",
        },
      ],
    });
  });

  it("requires a session id when loading messages", async () => {
    const response = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/messages"),
      new URL("http://localhost/sessions/messages"),
    );

    expect(response?.status).toBe(400);
  });

  it("resolves the active provider and model for every usage request", async () => {
    const activeModel = {
      provider: "ollama",
      model: "granite4.1:3b",
    };
    const received: Array<{
      sessionId: string;
      provider?: string;
      model?: string;
    }> = [];
    const context = {
      services: {
        sessions: {
          usage: (
            sessionId: string,
            options: { provider?: string; model?: string },
          ) => {
            received.push({ sessionId, ...options });
            return { sessionId, ...options };
          },
        },
        settings: {
          get: () => ({ model: { ...activeModel } }),
        },
      },
    } as unknown as AppContext;

    const requestUsage = () =>
      handleSessionRoutes(
        context,
        new Request("http://localhost/sessions/usage?sessionId=session-1"),
        new URL("http://localhost/sessions/usage?sessionId=session-1"),
      );

    await requestUsage();
    activeModel.provider = "openai";
    activeModel.model = "gpt-5.4";
    await requestUsage();

    expect(received).toEqual([
      {
        sessionId: "session-1",
        provider: "ollama",
        model: "granite4.1:3b",
      },
      {
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5.4",
      },
    ]);
  });

  it("searches sessions with a validated query and limit", async () => {
    const response = await handleSessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/search?query=deploy&limit=7"),
      new URL("http://localhost/sessions/search?query=deploy&limit=7"),
    );

    await expect(response?.json()).resolves.toEqual({
      hits: [{ query: "deploy", limit: 7 }],
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
