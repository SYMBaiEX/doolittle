import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleSessionCommand } from "./session-router";

function createInput(
  overrides: Partial<ChatTurnRequest> = {},
): ChatTurnRequest {
  return {
    message: "/resume",
    userId: "user-1",
    roomId: "telegram:room-1:user-1:root",
    source: "telegram",
    ...overrides,
  };
}

describe("session command router", () => {
  it("searches session history and lists sessions", async () => {
    const context = {
      config: {
        sessionSearchLimit: 5,
      },
      services: {
        sessions: {
          search: () => [
            {
              createdAt: "2026-03-28T00:00:00.000Z",
              role: "user",
              sessionId: "session-1",
              text: "prior note",
            },
          ],
          listSessions: () => [
            {
              sessionId: "session-1",
              messageCount: 4,
              startedAt: "2026-03-28T00:00:00.000Z",
              endedAt: null,
              participants: ["user-1"],
            },
          ],
        },
        gatewaySessions: {
          get: () => undefined,
        },
      },
    } as unknown as AgentExecutionContext;

    const search = await handleSessionCommand(
      createInput({ message: "/search prior" }),
      "/search prior",
      "session-1",
      context,
    );
    const sessions = await handleSessionCommand(
      createInput({ message: "/sessions" }),
      "/sessions",
      "session-1",
      context,
    );

    expect(search).toContain("session=session-1");
    expect(sessions).toContain("messages=4");
  });

  it("lists titled sessions and resumes onto an active gateway route", async () => {
    const activated: Array<{ sessionKey: string; sessionId: string }> = [];
    const context = {
      services: {
        sessions: {
          listTitled: () => [
            {
              sessionId: "session-2",
              title: "alpha",
              messageCount: 8,
              endedAt: null,
            },
          ],
          resolveByTitle: (query: string) =>
            query === "alpha"
              ? {
                  sessionId: "session-2",
                  title: "alpha",
                  messageCount: 8,
                  endedAt: null,
                }
              : undefined,
        },
        gatewaySessions: {
          get: () => ({ sessionKey: "telegram:room-1:user-1:root" }),
          setActiveAgentSession: (sessionKey: string, sessionId: string) => {
            activated.push({ sessionKey, sessionId });
          },
        },
      },
    } as unknown as AgentExecutionContext;

    const listed = await handleSessionCommand(
      createInput(),
      "/resume",
      "telegram:room-1:user-1:root",
      context,
    );
    const resumed = await handleSessionCommand(
      createInput({ message: "/resume alpha" }),
      "/resume alpha",
      "telegram:room-1:user-1:root",
      context,
    );

    expect(listed).toContain("alpha");
    expect(resumed).toContain("Resumed session alpha.");
    expect(activated).toEqual([
      {
        sessionKey: "telegram:room-1:user-1:root",
        sessionId: "session-2",
      },
    ]);
  });

  it("renames sessions and reports continuity, summary, and usage", async () => {
    const context = {
      services: {
        sessions: {
          rename: (sessionId: string, title: string) => ({ sessionId, title }),
          continuity: (sessionId: string) => ({
            sessionId,
            continuityKey: `ck:${sessionId}`,
          }),
          summarize: (sessionId: string) => ({
            sessionId,
            messages: 3,
          }),
          usage: (sessionId: string) => ({
            sessionId,
            turns: 2,
          }),
          resolveByTitle: (query: string) =>
            query === "alpha" ? { sessionId: "session-2" } : undefined,
        },
        gatewaySessions: {
          get: () => undefined,
        },
      },
    } as unknown as AgentExecutionContext;

    expect(
      await handleSessionCommand(
        createInput({ message: "/title focus" }),
        "/title focus",
        "session-1",
        context,
      ),
    ).toContain('"title": "focus"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session title session-2 :: archive" }),
        "/session title session-2 :: archive",
        "session-1",
        context,
      ),
    ).toContain('"sessionId": "session-2"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session continuity session-2" }),
        "/session continuity session-2",
        "session-1",
        context,
      ),
    ).toContain('"continuityKey": "ck:session-2"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session summary" }),
        "/session summary",
        "session-1",
        context,
      ),
    ).toContain('"sessionId": "session-1"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/usage alpha" }),
        "/usage alpha",
        "session-1",
        context,
      ),
    ).toContain('"sessionId": "session-2"');
  });
});
