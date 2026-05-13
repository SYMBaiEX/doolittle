import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import type { ChatCommandRouterDependencies } from "../chat-command-router/types";
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

const dependencies: ChatCommandRouterDependencies = {
  runAnalysis: async () => "compressed summary",
  runDelegationTaskInWorker: async () => undefined as never,
};

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
      dependencies,
    );
    const sessions = await handleSessionCommand(
      createInput({ message: "/sessions" }),
      "/sessions",
      "session-1",
      context,
      dependencies,
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
      dependencies,
    );
    const resumed = await handleSessionCommand(
      createInput({ message: "/resume alpha" }),
      "/resume alpha",
      "telegram:room-1:user-1:root",
      context,
      dependencies,
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
            title: sessionId === "session-2" ? "alpha" : undefined,
            messageCount: 2,
            userMessages: 1,
            assistantMessages: 1,
            systemMessages: 0,
            characterCount: 16,
            estimatedTokens: 4,
            lastPreview: "done",
          }),
          messagesBySession: () => [],
          resolveByTitle: (query: string) =>
            query === "alpha" ? { sessionId: "session-2" } : undefined,
        },
        contextCompression: {
          measure: () => ({
            estimatedTokens: 4,
            contextWindowTokens: 100,
            usageFraction: 0.04,
            overThreshold: false,
          }),
        },
        trajectories: {
          recentEvents: () => [],
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
        dependencies,
      ),
    ).toContain('"title": "focus"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session title session-2 :: archive" }),
        "/session title session-2 :: archive",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain('"sessionId": "session-2"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session continuity session-2" }),
        "/session continuity session-2",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain('"continuityKey": "ck:session-2"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/session summary" }),
        "/session summary",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain('"sessionId": "session-1"');
    expect(
      await handleSessionCommand(
        createInput({ message: "/usage alpha" }),
        "/usage alpha",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain("session: session-2");
  });

  it("undoes the latest conversational exchange through session memory", async () => {
    const context = {
      services: {
        sessions: {
          deleteLatestExchange: (sessionId: string) => ({
            sessionId,
            userMessage: {
              id: "msg-1",
              sessionId,
              roomId: "room-1",
              entityId: "user-1",
              role: "user",
              text: "try the Doolittle-native loop",
              createdAt: "2026-03-28T00:00:00.000Z",
            },
            assistantMessages: [],
            deletedMessages: 2,
          }),
        },
        gatewaySessions: {
          get: () => undefined,
        },
      },
    } as unknown as AgentExecutionContext;

    const undone = await handleSessionCommand(
      createInput({ message: "/undo" }),
      "/undo",
      "session-1",
      context,
      dependencies,
    );

    expect(undone).toContain("Undid the latest exchange");
    expect(undone).toContain("try the Doolittle-native loop");
  });

  it("compresses active session context and renders operator insights", async () => {
    const replaced: unknown[] = [];
    const trajectoryEvents: unknown[] = [];
    const messages = [
      "Set up Devin as default.",
      "Devin responded slowly.",
      "Investigated /usage and trajectories.",
      "Fixed command routing.",
      "Added model controls.",
      "Ready for audit.",
    ].map((text, index) => ({
      id: `msg-${index}`,
      sessionId: "session-1",
      roomId: "room-1",
      entityId: index % 2 === 0 ? "user-1" : "agent-1",
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text,
      createdAt: `2026-03-28T00:00:0${index}.000Z`,
    }));
    const context = {
      services: {
        sessions: {
          messagesBySession: () => messages,
          replaceSessionMessages: (_sessionId: string, next: unknown[]) => {
            replaced.push(...next);
          },
          usage: () => ({
            sessionId: "session-1",
            messageCount: messages.length,
            userMessages: 3,
            assistantMessages: 3,
            systemMessages: 0,
            characterCount: 120,
            estimatedTokens: 30,
            lastPreview: "Ready for audit.",
          }),
        },
        contextCompression: {
          measure: (input: unknown[]) => ({
            estimatedTokens: input.length * 20,
            contextWindowTokens: 1000,
            usageFraction: input.length / 50,
            overThreshold: false,
          }),
        },
        trajectories: {
          recordEvent: (event: unknown) => trajectoryEvents.push(event),
          recentEvents: () => trajectoryEvents,
        },
        userProfiles: {
          get: () => ({
            displayName: "Alex",
            status: "engaged",
            facts: ["uses Bun"],
            preferences: ["concise"],
            aliases: ["A"],
          }),
        },
        memory: {
          summary: (target: string) => ({
            target,
            entries: target === "user" ? 2 : 1,
            characters: 20,
            preview: [],
          }),
        },
        skillSynthesis: {
          listGeneratedSkills: () => [{ slug: "operator-loop" }],
        },
        gatewaySessions: {
          get: () => undefined,
        },
      },
    } as unknown as AgentExecutionContext;

    const compressed = await handleSessionCommand(
      createInput({ message: "/compress operator state" }),
      "/compress operator state",
      "session-1",
      context,
      dependencies,
    );
    const insights = await handleSessionCommand(
      createInput({ message: "/insights" }),
      "/insights",
      "session-1",
      context,
      dependencies,
    );

    expect(compressed).toContain("Context compressed");
    expect(replaced).toHaveLength(5);
    expect(JSON.stringify(replaced)).toContain("compressed summary");
    expect(insights).toContain("OPERATOR INSIGHTS");
    expect(insights).toContain("operator-loop");
  });
});
