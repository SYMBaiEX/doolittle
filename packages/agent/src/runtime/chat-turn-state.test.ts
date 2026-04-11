import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  createProfileObservationScheduler,
  createTurnState,
  extractCompatTextContent,
  startTrackedTurn,
  storeSessionMessage,
} from "./chat-turn/state";

describe("chat turn state helpers", () => {
  it("extracts user-facing text from content objects", () => {
    expect(
      extractCompatTextContent({ text: "hello", source: "local" } as never),
    ).toBe("hello");
    expect(extractCompatTextContent({ source: "local" } as never)).toBe("");
    expect(extractCompatTextContent(null)).toBe("");
  });

  it("builds deterministic turn state from input context", () => {
    const context = {
      runtime: { character: { name: "Doolittle" } },
      services: {
        settings: {
          get: () => ({
            agent: {
              runDepth: "standard",
              maxIterations: 1,
              toolProgressMode: "off",
            },
          }),
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    const input = {
      userId: "alice",
      message: "hello",
      source: "cli",
      roomId: "room:alice",
    };
    const turnA = createTurnState(input, context);
    const turnB = createTurnState(input, context);

    expect(turnA.agentName).toBe("Doolittle");
    expect(turnA.localInteractive).toBe(true);
    expect(turnA.sessionId).toBe("room:alice");
    expect(turnA.runId).toBeDefined();
    expect(turnA.roomId).toBe(turnB.roomId);
  });

  it("tracks user-facing turn events and startTurn payload", () => {
    const startPayload: unknown[] = [];
    const stored: unknown[] = [];
    const context = {
      runtime: {},
      services: {
        executionApprovals: {
          latestPendingForSession: () => null,
        },
        sessions: {
          storeMessage: (msg: unknown) => {
            stored.push(msg);
          },
        },
        runController: {
          startTurn: (payload: unknown) => {
            startPayload.push(payload);
          },
        },
        settings: {
          get: () => ({
            agent: {
              runDepth: "standard",
              maxIterations: 2,
              toolProgressMode: "all",
            },
          }),
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    const turn = {
      sessionId: "session-1",
      roomId: "room-1",
      entityId: "entity-1",
      runId: "run-1",
      agentName: "Doolittle",
      localInteractive: true,
      connectionSource: "cli",
      worldId: "world-1",
      messageServerId: "msg-server-1",
      settings: context.services.settings.get(),
    } as Parameters<typeof startTrackedTurn>[2];
    startTrackedTurn(
      { message: "status check", source: "cli", userId: "alice" },
      context,
      turn,
      {
        runDepth: "standard",
        maxIterations: 4,
        toolProgressMode: "all",
      },
    );

    expect(stored).toHaveLength(1);
    expect(startPayload).toHaveLength(1);
    expect((startPayload[0] as { source: string }).source).toBe("cli");
    expect((startPayload[0] as { message: string }).message).toBe(
      "status check",
    );
  });

  it("schedules profile observation on the next macrotask", async () => {
    const observed: string[] = [];
    const context = {
      services: {
        userProfiles: {
          observe: async () => {
            observed.push("observed");
          },
        },
      },
      runtime: {},
      config: {},
    } as unknown as AgentExecutionContext;
    const schedule = createProfileObservationScheduler(
      { userId: "alice", message: "hello", source: "cli" },
      context,
      "session-1",
    );

    schedule();
    expect(observed).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(observed).toHaveLength(1);
  });
});

describe("chat turn state helpers with session persistence", () => {
  it("writes messages with deterministic keys", () => {
    const messages: unknown[] = [];
    const context = {
      services: {
        sessions: {
          storeMessage: (msg: unknown) => messages.push(msg),
        },
      },
      runtime: {},
      config: {},
    } as unknown as AgentExecutionContext;

    storeSessionMessage(context, {
      sessionId: "s1",
      roomId: "r1",
      entityId: "u1",
      role: "assistant",
      text: "ok",
    });
    expect(messages).toHaveLength(1);
    expect((messages[0] as { sessionId: string }).sessionId).toBe("s1");
    expect((messages[0] as { role: string }).role).toBe("assistant");
  });
});
