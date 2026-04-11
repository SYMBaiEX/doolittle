import { describe, expect, it } from "bun:test";
import { handleCliSessionCommand } from "./session-commands";

describe("handleCliSessionCommand", () => {
  it("lists titled sessions and resumes matched titles", () => {
    const state = { activeSessionId: "cli:old", notices: [] as never[] };
    const context = {
      services: {
        sessions: {
          listTitled: () => [
            {
              title: "Alpha",
              sessionId: "sess-1",
              messageCount: 3,
              endedAt: undefined,
            },
          ],
          resolveByTitle: (query: string) =>
            query === "Alpha"
              ? { title: "Alpha", sessionId: "sess-1" }
              : undefined,
          rename: () => ({ sessionId: "sess-1", title: "ignored" }),
        },
      },
    } as never;

    expect(handleCliSessionCommand("/resume", context, state)?.text).toContain(
      "Alpha",
    );
    expect(
      handleCliSessionCommand("/resume Alpha", context, state),
    ).toMatchObject({
      text: "Resumed session Alpha.",
      tone: "success",
    });
    expect(state.activeSessionId).toBe("sess-1");
  });

  it("titles the active session and reports lookup misses", () => {
    const state = { activeSessionId: "cli:active", notices: [] as never[] };
    const context = {
      services: {
        sessions: {
          listTitled: () => [],
          resolveByTitle: () => undefined,
          rename: (sessionId: string, title: string) => ({ sessionId, title }),
        },
      },
    } as never;

    expect(
      handleCliSessionCommand("/resume Missing", context, state),
    ).toMatchObject({
      text: "Session not found for title: Missing",
      tone: "warning",
    });
    expect(
      handleCliSessionCommand("/title Sprint Review", context, state),
    ).toMatchObject({
      text: "Session titled: Sprint Review",
      tone: "success",
    });
  });
});
