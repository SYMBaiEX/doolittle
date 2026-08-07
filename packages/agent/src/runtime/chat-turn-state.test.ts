import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import {
  deleteNativeConversationMemories,
  persistAssistantTurnMemory,
  persistUserTurnMemory,
  replaceNativeConversationContext,
} from "./chat-turn/conversation-persistence";
import {
  createProfileObservationScheduler,
  createTurnState,
  extractCompatTextContent,
  startTrackedTurn,
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

  it("uses deterministic non-cli session fields", () => {
    const context = {
      runtime: {},
      services: {
        settings: {
          get: () => ({
            agent: {
              runDepth: "standard",
              maxIterations: 2,
              toolProgressMode: "off",
            },
          }),
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    const state = createTurnState(
      {
        userId: "bob",
        message: "status report",
        source: "gateway",
      },
      context,
    );

    expect(state.localInteractive).toBe(false);
    expect(state.connectionSource).toBe("gateway");
    expect(state.sessionId).toBe("room:bob");
    expect(state.messageServerId).toBe(
      stableRuntimeUuid("doolittle-message-server"),
    );
  });

  it("treats desktop chats as local interactive turns without merging rooms", () => {
    const context = {
      runtime: { character: { name: "Doolittle" } },
      services: {
        settings: {
          get: () => ({
            agent: {
              runDepth: "standard",
              maxIterations: 4,
              toolProgressMode: "all",
            },
          }),
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    const first = createTurnState(
      {
        userId: "desktop-user",
        message: "What is this repo? What is this project?",
        source: "desktop",
        roomId: "desktop:project-one",
      },
      context,
    );
    const second = createTurnState(
      {
        userId: "desktop-user",
        message: "What is this repo?",
        source: "desktop",
        roomId: "desktop:project-two",
      },
      context,
    );

    expect(first.localInteractive).toBe(true);
    expect(first.connectionSource).toBe("desktop");
    expect(first.sessionId).toBe("desktop:project-one");
    expect(first.roomId).toBe(stableRuntimeUuid("desktop:project-one"));
    expect(second.roomId).toBe(stableRuntimeUuid("desktop:project-two"));
    expect(first.roomId).not.toBe(second.roomId);
    expect(first.messageServerId).toBe(
      stableRuntimeUuid("doolittle-message-server"),
    );
  });

  it("tracks user-facing turn events and startTurn payload", async () => {
    const startPayload: unknown[] = [];
    const stored: unknown[] = [];
    const context = {
      runtime: {
        agentId: "agent-1",
        createMemory: async (memory: { id: string }) => memory.id,
        queueEmbeddingGeneration: async () => undefined,
      },
      services: {
        executionApprovals: {
          latestPendingForSession: () => null,
        },
        sessions: {
          storeMessage: (msg: unknown) => {
            stored.push(msg);
          },
          continuityKey: (sessionId: string) => sessionId,
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
      messageId: "message-1",
      settings: context.services.settings.get(),
    } as Parameters<typeof startTrackedTurn>[2];
    await startTrackedTurn(
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

  it("defaults to configured runtime policy and marks pending approvals", async () => {
    const startPayload: unknown[] = [];
    const context = {
      runtime: {
        agentId: "agent-1",
        createMemory: async (memory: { id: string }) => memory.id,
        queueEmbeddingGeneration: async () => undefined,
      },
      services: {
        executionApprovals: {
          latestPendingForSession: () => ({ id: "pending-1" }),
        },
        sessions: {
          storeMessage: () => undefined,
          continuityKey: (sessionId: string) => sessionId,
        },
        runController: {
          startTurn: (payload: unknown) => {
            startPayload.push(payload);
          },
        },
        settings: {
          get: () => ({
            agent: {
              runDepth: "deep",
              maxIterations: 11,
              toolProgressMode: "all",
            },
          }),
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    const turn = {
      sessionId: "session-2",
      roomId: "room-2",
      entityId: "entity-2",
      runId: "run-2",
      agentName: "Doolittle",
      localInteractive: false,
      connectionSource: "gateway",
      worldId: "world-2",
      messageServerId: "msg-2",
      messageId: "message-2",
      settings: context.services.settings.get(),
    } as Parameters<typeof startTrackedTurn>[2];

    await startTrackedTurn(
      { message: "report", source: "gateway", userId: "bob" },
      context,
      turn,
      undefined,
    );

    expect(startPayload).toHaveLength(1);
    expect(
      (startPayload[0] as { pendingApprovals: number }).pendingApprovals,
    ).toBe(1);
    expect((startPayload[0] as { runDepth: string }).runDepth).toBe("deep");
    expect(
      (startPayload[0] as { configuredMaxIterations: number })
        .configuredMaxIterations,
    ).toBe(11);
  });

  it("schedules profile observation on the next macrotask", async () => {
    const observed: string[] = [];
    const flatMemoryWrites: string[] = [];
    const context = {
      services: {
        userProfiles: {
          observe: async () => {
            observed.push("observed");
          },
        },
        memory: {
          add: (_target: string, value: string) => {
            flatMemoryWrites.push(value);
          },
        },
      },
      runtime: {
        getService: (name: string) =>
          name === "doolittle_rolodex"
            ? {
                observe: async () => {
                  observed.push("observed");
                },
              }
            : null,
      },
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
    expect(flatMemoryWrites).toHaveLength(0);
  });
});

describe("chat turn state helpers with session persistence", () => {
  it("persists assistant messages through Eliza before projecting them", async () => {
    const messages: unknown[] = [];
    const nativeMemories: unknown[] = [];
    const context = {
      services: {
        sessions: {
          storeMessage: (msg: unknown) => messages.push(msg),
          continuityKey: (sessionId: string) => sessionId,
        },
      },
      runtime: {
        agentId: "agent-1",
        createMemory: async (memory: unknown) => {
          nativeMemories.push(memory);
          return (memory as { id: string }).id;
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await persistAssistantTurnMemory({
      context,
      turn: {
        sessionId: "s1",
        roomId: "r1",
        entityId: "u1",
        messageId: "m1",
        connectionSource: "desktop",
      } as Parameters<typeof persistAssistantTurnMemory>[0]["turn"],
      text: "ok",
    });
    expect(nativeMemories).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect((messages[0] as { sessionId: string }).sessionId).toBe("s1");
    expect((messages[0] as { role: string }).role).toBe("assistant");
  });

  it("hydrates a legacy or forked transcript into an empty Eliza room before the new user memory", async () => {
    const nativeMemories: Array<{
      id: string;
      content: { text: string };
      metadata?: { doolittle?: { userId?: string } };
    }> = [];
    const context = {
      services: {
        sessions: {
          continuityKey: (sessionId: string) => sessionId,
          messagesBySession: () => [
            {
              id: "legacy-user",
              sessionId: "fork-1",
              roomId: "old-room",
              entityId: "user-1",
              role: "user",
              text: "Inherited question",
              createdAt: "2026-07-29T00:00:00.000Z",
            },
            {
              id: "legacy-assistant",
              sessionId: "fork-1",
              roomId: "old-room",
              entityId: "agent-1",
              role: "assistant",
              text: "Inherited answer",
              createdAt: "2026-07-29T00:00:01.000Z",
            },
          ],
          storeMessage: () => undefined,
        },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [],
        createMemory: async (memory: {
          id: string;
          content: { text: string };
        }) => {
          nativeMemories.push(memory);
          return memory.id;
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await persistUserTurnMemory({
      context,
      turn: {
        sessionId: "fork-1",
        roomId: "room-1",
        entityId: "user-1",
        messageId: "00000000-0000-4000-8000-000000000001",
        connectionSource: "desktop",
      } as Parameters<typeof persistUserTurnMemory>[0]["turn"],
      userId: "desktop-user",
      text: "Continue from the fork",
    });

    expect(nativeMemories.map((memory) => memory.content.text)).toEqual([
      "Inherited question",
      "Inherited answer",
      "Continue from the fork",
    ]);
    expect(nativeMemories.at(-1)?.metadata?.doolittle?.userId).toBe(
      "desktop-user",
    );
  });

  it("leaves current native user persistence to Eliza after hydrating inherited history", async () => {
    const nativeTexts: string[] = [];
    const projectedTexts: string[] = [];
    const context = {
      services: {
        sessions: {
          continuityKey: (sessionId: string) => sessionId,
          messagesBySession: () => [
            {
              id: "legacy-user",
              sessionId: "fork-2",
              roomId: "old-room",
              entityId: "user-1",
              role: "user",
              text: "Inherited question",
              createdAt: "2026-07-29T00:00:00.000Z",
            },
          ],
          storeMessage: (message: { text: string }) => {
            projectedTexts.push(message.text);
          },
        },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [],
        createMemory: async (memory: {
          id: string;
          content: { text: string };
        }) => {
          nativeTexts.push(memory.content.text);
          return memory.id;
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await persistUserTurnMemory({
      context,
      turn: {
        sessionId: "fork-2",
        roomId: "room-2",
        entityId: "user-1",
        messageId: "00000000-0000-4000-8000-000000000002",
        connectionSource: "desktop",
      } as Parameters<typeof persistUserTurnMemory>[0]["turn"],
      userId: "desktop-user",
      text: "Continue through Eliza",
      nativeOwner: "eliza-message-service",
    });

    expect(nativeTexts).toEqual(["Inherited question"]);
    expect(projectedTexts).toEqual(["Continue through Eliza"]);
  });

  it("replaces native middle context before its projection is changed", async () => {
    const created: string[] = [];
    const deleted: string[] = [];
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        createMemory: async (memory: { id: string }) => {
          created.push(memory.id);
          return memory.id;
        },
        deleteMemory: async (id: string) => {
          deleted.push(id);
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;
    const replacedId = "00000000-0000-4000-8000-000000000010";
    const summaryId = "00000000-0000-4000-8000-000000000011";

    await replaceNativeConversationContext({
      context,
      turn: {
        sessionId: "s1",
        roomId: "r1",
        entityId: "user-1",
        connectionSource: "desktop",
      } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
      replaced: [{ id: replacedId } as never],
      summary: {
        id: summaryId,
        sessionId: "s1",
        roomId: "r1",
        entityId: "system",
        role: "system",
        text: "summary",
        createdAt: "2026-07-30T00:00:00.000Z",
      },
    });

    expect(created).toEqual([summaryId]);
    expect(deleted).toEqual([replacedId]);
  });

  it("does not claim native deletion for legacy projection-only ids", async () => {
    const context = {
      runtime: {
        agentId: "agent-1",
        createMemory: async () => "memory",
      },
      services: {},
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      deleteNativeConversationMemories(context, [{ id: "legacy-message" }]),
    ).resolves.toEqual({ deleted: [], unsupported: ["legacy-message"] });
  });
});
