import { describe, expect, it, vi } from "vitest";
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

  it("gives each CLI session an isolated native room while preserving its shared message server", () => {
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

    const first = createTurnState(
      {
        userId: "local-user",
        message: "first session",
        source: "cli",
        roomId: "cli:first",
      },
      context,
    );
    const second = createTurnState(
      {
        userId: "local-user",
        message: "second session",
        source: "cli",
        roomId: "cli:second",
      },
      context,
    );

    expect(first.roomId).toBe(stableRuntimeUuid("cli:first"));
    expect(second.roomId).toBe(stableRuntimeUuid("cli:second"));
    expect(first.roomId).not.toBe(second.roomId);
    expect(first.messageServerId).toBe(
      stableRuntimeUuid("Doolittle-cli-server"),
    );
    expect(second.messageServerId).toBe(first.messageServerId);
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
  it("does not hydrate one CLI session from another session's native room", async () => {
    const queriedRoomIds: string[] = [];
    const nativeByRoom = new Map<
      string,
      Array<{ id: string; content: { text: string } }>
    >([
      [
        stableRuntimeUuid("cli:first"),
        [
          {
            id: "00000000-0000-4000-8000-000000000101",
            content: { text: "first-session secret" },
          },
        ],
      ],
    ]);
    const projected: Array<{ sessionId: string; text: string }> = [];
    const context = {
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
        sessions: {
          continuityKey: (sessionId: string) => sessionId,
          messagesBySession: () => [],
          replaceSessionMessages: (_sessionId: string, messages: unknown[]) => {
            projected.push(
              ...(messages as Array<{ sessionId: string; text: string }>),
            );
          },
          storeMessage: (message: { sessionId: string; text: string }) => {
            projected.push(message);
          },
        },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async ({ roomId }: { roomId: string }) => {
          queriedRoomIds.push(roomId);
          return nativeByRoom.get(roomId) ?? [];
        },
        createMemory: async (memory: {
          id: string;
          roomId: string;
          content: { text: string };
        }) => {
          const room = nativeByRoom.get(memory.roomId) ?? [];
          room.push(memory);
          nativeByRoom.set(memory.roomId, room);
          return memory.id;
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;
    const second = createTurnState(
      {
        userId: "local-user",
        message: "new isolated session",
        source: "cli",
        roomId: "cli:second",
      },
      context,
    );

    await persistUserTurnMemory({
      context,
      turn: second,
      userId: "local-user",
      text: "new isolated session",
    });

    expect(queriedRoomIds).toEqual([stableRuntimeUuid("cli:second")]);
    expect(projected).toEqual([
      expect.objectContaining({
        sessionId: "cli:second",
        text: "new isolated session",
      }),
    ]);
    expect(
      nativeByRoom.get(stableRuntimeUuid("cli:first"))?.[0]?.content.text,
    ).toBe("first-session secret");
  });

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

  it("projects every paged native conversation memory without deleting an older suffix", async () => {
    const native = Array.from({ length: 10_005 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      roomId: "room-page",
      entityId: "user-1",
      content: { text: `native-${index}` },
      metadata: { doolittle: { role: "user" as const } },
      createdAt: index,
    }));
    const offsets: number[] = [];
    const projected: unknown[][] = [];
    const context = {
      services: {
        sessions: {
          continuityKey: (sessionId: string) => sessionId,
          messagesBySession: () => [],
          replaceSessionMessages: (_sessionId: string, messages: unknown[]) => {
            projected.push(messages);
          },
          storeMessage: () => undefined,
        },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async ({
          offset = 0,
          limit = 0,
        }: {
          offset?: number;
          limit?: number;
        }) => {
          offsets.push(offset);
          return native
            .slice()
            .reverse()
            .slice(offset, offset + limit);
        },
        createMemory: async () => "unused",
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await persistUserTurnMemory({
      context,
      turn: {
        sessionId: "page-1",
        roomId: "room-page",
        entityId: "user-1",
        messageId: "00000000-0000-4000-8000-999999999999",
        connectionSource: "desktop",
      } as Parameters<typeof persistUserTurnMemory>[0]["turn"],
      userId: "desktop-user",
      text: "Eliza owns this user memory",
      nativeOwner: "eliza-message-service",
    });

    // The migration bridge is scoped to the live runtime/session. Later turns
    // already persist through Eliza and must not rescan the complete history.
    await persistUserTurnMemory({
      context,
      turn: {
        sessionId: "page-1",
        roomId: "room-page",
        entityId: "user-1",
        messageId: "00000000-0000-4000-8000-999999999998",
        connectionSource: "desktop",
      } as Parameters<typeof persistUserTurnMemory>[0]["turn"],
      userId: "desktop-user",
      text: "Eliza owns the next user memory too",
      nativeOwner: "eliza-message-service",
    });

    expect(offsets).toEqual(
      Array.from({ length: 21 }, (_, index) => index * 500),
    );
    expect(projected).toHaveLength(1);
    const completeProjection = projected[0] ?? [];
    expect(completeProjection).toHaveLength(10_005);
    expect((completeProjection[0] as { text: string }).text).toBe("native-0");
    expect((completeProjection.at(-1) as { text: string }).text).toBe(
      "native-10004",
    );
  });

  it("replaces native middle context before its projection is changed", async () => {
    const created: string[] = [];
    const deleted: string[] = [];
    const replacedId = "00000000-0000-4000-8000-000000000010";
    const summaryId = "00000000-0000-4000-8000-000000000011";
    const native = [
      {
        id: replacedId,
        roomId: "r1",
        entityId: "user-1",
        content: { text: "replaced" },
      },
    ];
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => native,
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

    await replaceNativeConversationContext({
      context,
      turn: {
        sessionId: "s1",
        roomId: "r1",
        entityId: "user-1",
        connectionSource: "desktop",
      } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
      replaced: [{ id: replacedId, roomId: "r1" } as never],
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

  it("rejects partial native replacement capability before writing a summary", async () => {
    const replacedId = "00000000-0000-4000-8000-000000000012";
    const summaryId = "00000000-0000-4000-8000-000000000013";

    for (const partialRuntime of [
      { getMemories: async () => [], deleteMemory: async () => undefined },
      {
        createMemory: vi.fn(async () => summaryId),
        deleteMemory: async () => undefined,
      },
      {
        createMemory: vi.fn(async () => summaryId),
        getMemories: async () => [],
      },
    ]) {
      const createMemory =
        "createMemory" in partialRuntime
          ? partialRuntime.createMemory
          : vi.fn();
      const context = {
        services: {
          sessions: { continuityKey: (sessionId: string) => sessionId },
        },
        runtime: {
          agentId: "agent-1",
          ...partialRuntime,
        },
        config: {},
      } as unknown as AgentExecutionContext;

      await expect(
        replaceNativeConversationContext({
          context,
          turn: {
            sessionId: "s-capability",
            roomId: "room-capability",
            entityId: "user-1",
            connectionSource: "desktop",
          } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
          replaced: [{ id: replacedId, roomId: "room-capability" }] as never,
          summary: {
            id: summaryId,
            sessionId: "s-capability",
            roomId: "room-capability",
            entityId: "system",
            role: "system",
            text: "summary",
            createdAt: "2026-07-30T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow(
        "requires create, read, and delete memory capabilities",
      );
      expect(createMemory).not.toHaveBeenCalled();
    }
  });

  it("restores only successfully deleted native memories when a multi-delete fails", async () => {
    const firstId = "00000000-0000-4000-8000-000000000021";
    const secondId = "00000000-0000-4000-8000-000000000022";
    const otherId = "00000000-0000-4000-8000-000000000023";
    const native = new Map<
      string,
      {
        id: string;
        roomId: string;
        entityId: string;
        content: { text: string; source?: string };
        metadata: unknown;
        createdAt: number;
      }
    >([
      [
        firstId,
        {
          id: firstId,
          roomId: "room-1",
          entityId: "user-1",
          content: { text: "first", source: "desktop" },
          metadata: { doolittle: { role: "user", marker: "preserve" } },
          createdAt: 101,
        },
      ],
      [
        secondId,
        {
          id: secondId,
          roomId: "room-1",
          entityId: "agent-1",
          content: { text: "second", source: "desktop" },
          metadata: { doolittle: { role: "assistant" } },
          createdAt: 102,
        },
      ],
      [
        otherId,
        {
          id: otherId,
          roomId: "room-1",
          entityId: "user-2",
          content: { text: "unrelated newer memory" },
          metadata: { source: "other-writer" },
          createdAt: 103,
        },
      ],
    ]);
    const deleted: string[] = [];
    const created: Array<{ id: string; metadata?: unknown }> = [];
    const embedded: Array<{ id: string; priority: "high" | "normal" }> = [];
    const context = {
      services: {},
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [...native.values()],
        createMemory: async (memory: { id: string; metadata?: unknown }) => {
          created.push(memory);
          native.set(memory.id, memory as never);
          return memory.id;
        },
        queueEmbeddingGeneration: async (
          memory: { id: string },
          priority: "high" | "normal",
        ) => {
          embedded.push({ id: memory.id, priority });
        },
        deleteMemory: async (id: string) => {
          deleted.push(id);
          native.delete(id);
          if (id === secondId) throw new Error("second delete failed");
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      deleteNativeConversationMemories(context, [
        { id: firstId, roomId: "room-1" },
        { id: secondId, roomId: "room-1" },
      ]),
    ).rejects.toThrow("deleted memories were restored");

    expect(deleted).toEqual([firstId, secondId]);
    expect([...native.keys()].sort()).toEqual(
      [firstId, secondId, otherId].sort(),
    );
    expect(native.get(firstId)).toMatchObject({
      content: { text: "first", source: "desktop" },
      metadata: { doolittle: { role: "user", marker: "preserve" } },
      createdAt: 101,
    });
    expect(created).toEqual([
      expect.objectContaining({
        id: firstId,
        metadata: { doolittle: { role: "user", marker: "preserve" } },
      }),
      expect.objectContaining({ id: secondId }),
    ]);
    expect(embedded).toEqual([
      { id: firstId, priority: "high" },
      { id: secondId, priority: "normal" },
    ]);
  });

  it("removes a persisted summary after partial native context replacement fails", async () => {
    const firstId = "00000000-0000-4000-8000-000000000031";
    const secondId = "00000000-0000-4000-8000-000000000032";
    const summaryId = "00000000-0000-4000-8000-000000000033";
    const native = new Map<
      string,
      {
        id: string;
        roomId: string;
        content: { text: string };
      }
    >([
      [firstId, { id: firstId, roomId: "room-2", content: { text: "one" } }],
      [secondId, { id: secondId, roomId: "room-2", content: { text: "two" } }],
    ]);
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [...native.values()],
        createMemory: async (memory: { id: string }) => {
          native.set(memory.id, memory as never);
          return memory.id;
        },
        deleteMemory: async (id: string) => {
          if (id === secondId) throw new Error("middle delete failed");
          native.delete(id);
        },
        queueEmbeddingGeneration: async () => undefined,
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      replaceNativeConversationContext({
        context,
        turn: {
          sessionId: "s2",
          roomId: "room-2",
          entityId: "user-1",
          connectionSource: "desktop",
        } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
        replaced: [
          { id: firstId, roomId: "room-2" },
          { id: secondId, roomId: "room-2" },
        ] as never,
        summary: {
          id: summaryId,
          sessionId: "s2",
          roomId: "room-2",
          entityId: "system",
          role: "system",
          text: "summary",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("deleted memories were restored");

    expect([...native.keys()].sort()).toEqual([firstId, secondId].sort());
    expect(native.get(firstId)?.content.text).toBe("one");
    expect(native.has(summaryId)).toBe(false);
  });

  it("removes a summary written before createMemory rejects", async () => {
    const originalId = "00000000-0000-4000-8000-000000000034";
    const summaryId = "00000000-0000-4000-8000-000000000035";
    const native = new Map<
      string,
      {
        id: string;
        roomId: string;
        entityId: string;
        content: { text: string };
      }
    >([
      [
        originalId,
        {
          id: originalId,
          roomId: "room-3",
          entityId: "user-1",
          content: { text: "original" },
        },
      ],
    ]);
    const deleted: string[] = [];
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [...native.values()],
        createMemory: async (memory: {
          id: string;
          roomId: string;
          entityId: string;
          content: { text: string };
        }) => {
          // PostgreSQL JSONB can return equivalent metadata with a different
          // insertion order than the object that was written.
          native.set(memory.id, {
            ...memory,
            metadata: {
              doolittle: {
                projectionOriginMessageId: summaryId,
                source: "desktop",
                role: "system",
              },
              sessionKey: "s3",
              sessionId: "s3",
            },
          } as never);
          throw new Error("create rejected after write");
        },
        deleteMemory: async (id: string) => {
          deleted.push(id);
          native.delete(id);
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      replaceNativeConversationContext({
        context,
        turn: {
          sessionId: "s3",
          roomId: "room-3",
          entityId: "user-1",
          connectionSource: "desktop",
        } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
        replaced: [{ id: originalId, roomId: "room-3" }] as never,
        summary: {
          id: summaryId,
          sessionId: "s3",
          roomId: "room-3",
          entityId: "system",
          role: "system",
          text: "summary",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("create rejected after write");

    expect(deleted).toEqual([summaryId]);
    expect([...native.keys()]).toEqual([originalId]);
  });

  it("refuses to delete a different concurrent memory with the summary id", async () => {
    const originalId = "00000000-0000-4000-8000-000000000038";
    const summaryId = "00000000-0000-4000-8000-000000000039";
    const native = new Map<string, Record<string, unknown>>([
      [
        originalId,
        {
          id: originalId,
          agentId: "agent-1",
          roomId: "room-5",
          entityId: "user-1",
          content: { text: "original" },
          metadata: {},
        },
      ],
    ]);
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [...native.values()],
        createMemory: async (memory: Record<string, unknown>) => {
          native.set(String(memory.id), {
            ...memory,
            metadata: { replacedBy: "another writer" },
          });
          throw new Error("create rejected after concurrent write");
        },
        deleteMemory: async (id: string) => native.delete(id),
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      replaceNativeConversationContext({
        context,
        turn: {
          sessionId: "s5",
          roomId: "room-5",
          entityId: "user-1",
          connectionSource: "desktop",
        } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
        replaced: [{ id: originalId, roomId: "room-5" }] as never,
        summary: {
          id: summaryId,
          sessionId: "s5",
          roomId: "room-5",
          entityId: "system",
          role: "system",
          text: "summary",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("summary could not be removed");

    expect(native.get(summaryId)?.metadata).toEqual({
      replacedBy: "another writer",
    });
    expect(native.has(originalId)).toBe(true);
  });

  it("removes a summary when embedding enqueue rejects after persistence", async () => {
    const originalId = "00000000-0000-4000-8000-000000000036";
    const summaryId = "00000000-0000-4000-8000-000000000037";
    const native = new Map<
      string,
      {
        id: string;
        roomId: string;
        entityId: string;
        content: { text: string };
      }
    >([
      [
        originalId,
        {
          id: originalId,
          roomId: "room-4",
          entityId: "user-1",
          content: { text: "original" },
        },
      ],
    ]);
    const deleted: string[] = [];
    const context = {
      services: {
        sessions: { continuityKey: (sessionId: string) => sessionId },
      },
      runtime: {
        agentId: "agent-1",
        getMemories: async () => [...native.values()],
        createMemory: async (memory: {
          id: string;
          roomId: string;
          entityId: string;
          content: { text: string };
        }) => {
          native.set(memory.id, memory);
          return memory.id;
        },
        queueEmbeddingGeneration: async () => {
          throw new Error("embedding enqueue rejected");
        },
        deleteMemory: async (id: string) => {
          deleted.push(id);
          native.delete(id);
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;

    await expect(
      replaceNativeConversationContext({
        context,
        turn: {
          sessionId: "s4",
          roomId: "room-4",
          entityId: "user-1",
          connectionSource: "desktop",
        } as Parameters<typeof replaceNativeConversationContext>[0]["turn"],
        replaced: [{ id: originalId, roomId: "room-4" }] as never,
        summary: {
          id: summaryId,
          sessionId: "s4",
          roomId: "room-4",
          entityId: "system",
          role: "system",
          text: "summary",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("embedding enqueue rejected");

    expect(deleted).toEqual([summaryId]);
    expect([...native.keys()]).toEqual([originalId]);
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
