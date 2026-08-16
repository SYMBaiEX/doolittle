import { describe, expect, it, vi } from "vitest";
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
  executeDelegationTask: async () => undefined as never,
};

describe("session command router", () => {
  it("denies global session search and listing to a Telegram sender", async () => {
    const searchSessions = vi.fn(() => []);
    const listSessions = vi.fn(() => []);
    const context = {
      config: {
        sessionSearchLimit: 5,
      },
      services: {
        sessions: {
          search: searchSessions,
          listSessions,
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

    expect(search).toBe(
      "Global session history is available only to a local or authenticated API operator.",
    );
    expect(sessions).toBe(search);
    expect(searchSessions).not.toHaveBeenCalled();
    expect(context.services.sessions.listSessions).not.toHaveBeenCalled();

    await expect(
      handleSessionCommand(
        createInput({ message: "/search prior", source: "cli" }),
        "/search prior",
        "session-1",
        context,
        dependencies,
      ),
    ).resolves.toBe("No prior session matches found.");
    await expect(
      handleSessionCommand(
        createInput({ message: "/sessions", source: "api" }),
        "/sessions",
        "session-1",
        context,
        dependencies,
      ),
    ).resolves.toBe("No sessions recorded.");
    expect(searchSessions).toHaveBeenCalledOnce();
    expect(listSessions).toHaveBeenCalledOnce();
  });

  it("does not let a Telegram sender list or resume another session", async () => {
    const activated: Array<{ sessionKey: string; sessionId: string }> = [];
    const listTitled = vi.fn(() => []);
    const resolveByTitle = vi.fn(() => undefined);
    const context = {
      services: {
        sessions: {
          listTitled,
          resolveByTitle,
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

    expect(listed).toContain("only to a local or authenticated API operator");
    expect(resumed).toBe(listed);
    expect(listTitled).not.toHaveBeenCalled();
    expect(resolveByTitle).not.toHaveBeenCalled();
    expect(activated).toEqual([]);
  });

  it("preserves global session controls for local and authenticated API operators", async () => {
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
        trajectoryEvaluation: {
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
        createInput({
          message: "/session title session-2 :: archive",
          source: "cli",
        }),
        "/session title session-2 :: archive",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain('"sessionId": "session-2"');
    expect(
      await handleSessionCommand(
        createInput({
          message: "/session continuity session-2",
          source: "desktop",
        }),
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
        createInput({ message: "/usage alpha", source: "api" }),
        "/usage alpha",
        "session-1",
        context,
        dependencies,
      ),
    ).toContain("session: session-2");
  });

  it("allows current-session controls but denies other-session controls to a gateway sender", async () => {
    const rename = vi.fn((sessionId: string) => ({ sessionId }));
    const continuity = vi.fn((sessionId: string) => ({ sessionId }));
    const summarize = vi.fn((sessionId: string) => ({ sessionId }));
    const usage = vi.fn((sessionId: string) => ({
      sessionId,
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      systemMessages: 0,
      characterCount: 0,
      estimatedTokens: 0,
    }));
    const context = {
      services: {
        sessions: {
          rename,
          continuity,
          summarize,
          usage,
          messagesBySession: () => [],
        },
        contextCompression: {
          measure: () => ({
            estimatedTokens: 0,
            contextWindowTokens: 100,
            usageFraction: 0,
            overThreshold: false,
          }),
        },
      },
    } as unknown as AgentExecutionContext;
    const sessionKey = "slack:room-1:user-1:root";

    await expect(
      handleSessionCommand(
        createInput({ source: "slack", message: "/title mine" }),
        "/title mine",
        sessionKey,
        context,
        dependencies,
      ),
    ).resolves.toContain(sessionKey);
    await expect(
      handleSessionCommand(
        createInput({ source: "slack", message: "/session summary" }),
        "/session summary",
        sessionKey,
        context,
        dependencies,
      ),
    ).resolves.toContain(sessionKey);
    await expect(
      handleSessionCommand(
        createInput({
          source: "slack",
          message: "/session continuity another-session",
        }),
        "/session continuity another-session",
        sessionKey,
        context,
        dependencies,
      ),
    ).resolves.toContain("only to a local or authenticated API operator");
    await expect(
      handleSessionCommand(
        createInput({ source: "slack", message: "/usage another-session" }),
        "/usage another-session",
        sessionKey,
        context,
        dependencies,
      ),
    ).resolves.toContain("only to a local or authenticated API operator");

    expect(rename).toHaveBeenCalledWith(sessionKey, "mine");
    expect(summarize).toHaveBeenCalledWith(sessionKey);
    expect(continuity).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
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
      runtime: {
        getService: (name: string) =>
          name === "doolittle_rolodex"
            ? {
                get: () => ({
                  displayName: "Alex",
                  status: "engaged",
                  facts: ["uses Bun"],
                  preferences: ["concise"],
                  aliases: ["A"],
                }),
              }
            : null,
      },
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
        trajectoryEvaluation: {
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
