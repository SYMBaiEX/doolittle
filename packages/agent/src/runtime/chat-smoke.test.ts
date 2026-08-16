import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUniqueUuid } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";

function createContext(overrides: Partial<AgentExecutionContext> = {}) {
  return {
    runtime: {
      logger: undefined,
      getSetting: () => undefined,
      setSetting: () => undefined,
    },
    config: {
      workspaceDir: "/workspace/demo",
    },
    services: {
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 2,
            toolProgressMode: "off",
          },
          model: {
            provider: "openai",
            model: "gpt-4.1",
          },
          execution: {
            backend: "local-shell",
          },
        }),
      },
      runController: {
        startTurn: () => undefined,
        updateThinking: () => undefined,
        finishTurn: () => undefined,
      },
    },
    ...overrides,
  } as AgentExecutionContext;
}

function createInput(
  message: string,
  source = "cli" as ChatTurnRequest["source"],
) {
  return {
    userId: "alice",
    roomId: "room:alice",
    message,
    source,
  } as ChatTurnRequest;
}

async function loadHandleAgentTurn() {
  const module = await import("./chat");
  return module;
}

function mockWorkflowCommands(overrides?: {
  resolveWorkflowCommandPrompt?: () =>
    | {
        command: string;
        prompt: string;
      }
    | undefined;
}) {
  vi.doMock("@/runtime/workflow-commands", () => ({
    getWorkflowCommandCatalogEntries: () => [],
    renderWorkflowCommandCatalog: () => "workflow-catalog",
    listWorkflowCommands: () => [],
    resolveWorkflowCommandPrompt:
      overrides?.resolveWorkflowCommandPrompt ?? (() => undefined),
  }));
}

function retryProjectionSupport(messages: unknown[] = []) {
  return {
    messagesBySession: () => structuredClone(messages),
    replaceSessionMessages: vi.fn(),
  };
}

describe("chat turn orchestration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("injects direct official delegation execution into command routing", async () => {
    const executeEffectiveDelegationTask = vi.fn(async () => ({
      id: "task-1",
    }));
    const buildCommandResponse = vi.fn(
      async (
        _input: ChatTurnRequest,
        _context: AgentExecutionContext,
        _hooks: unknown,
        dependencies: {
          executeDelegationTask: (taskId: string) => Promise<unknown>;
        },
      ) => dependencies.executeDelegationTask("task-1"),
    );
    vi.doMock("@/runtime/chat-command-router", () => ({
      buildCommandResponse,
    }));
    vi.doMock("@/runtime/native/service-bridge/delegation", () => ({
      executeEffectiveDelegationTask,
    }));

    const { executeSlashCommand } = await loadHandleAgentTurn();
    const context = createContext({
      services: {
        ...createContext().services,
        delegationProjection: { get: () => ({ id: "task-1" }) } as never,
      },
    });
    await expect(
      executeSlashCommand(createInput("/delegate execute task-1"), context),
    ).resolves.toEqual({
      id: "task-1",
    });
    expect(executeEffectiveDelegationTask).toHaveBeenCalledWith(
      context.runtime,
      context.services.delegationProjection,
      "task-1",
    );
  });

  it("rejects a late cancelled /compress result before it mutates history", async () => {
    const controller = new AbortController();
    const abortError = new Error("model analysis cancelled");
    abortError.name = "AbortError";
    const runModelAnalysis = vi.fn(
      async (
        _context: AgentExecutionContext,
        _prompt: string,
        options: { abortSignal?: AbortSignal },
      ) => {
        expect(options.abortSignal).toBe(controller.signal);
        controller.abort(abortError);
        return "late summary";
      },
    );
    const replaceSessionMessages = vi.fn();
    const createMemory = vi.fn();
    const deleteMemory = vi.fn();
    vi.doUnmock("@/runtime/chat-command-router");
    vi.doMock("@/runtime/model-analysis", () => ({ runModelAnalysis }));
    vi.doMock("@/runtime/native/service-bridge/ownership", () => ({
      getEffectiveActivePersonality: () => ({ id: "primary" }),
      getEffectiveUserProfile: () => undefined,
    }));

    const { executeSlashCommand } = await loadHandleAgentTurn();
    const context = createContext({
      runtime: {
        ...createContext().runtime,
        createMemory,
        deleteMemory,
      },
      services: {
        ...createContext().services,
        sessions: {
          messagesBySession: () => [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sessionId: "room:alice",
              roomId: "00000000-0000-4000-8000-000000000003",
              entityId: "alice",
              role: "user",
              text: "first",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "00000000-0000-4000-8000-000000000004",
              sessionId: "room:alice",
              roomId: "00000000-0000-4000-8000-000000000003",
              entityId: "agent",
              role: "assistant",
              text: "second",
              createdAt: "2026-01-01T00:00:01.000Z",
            },
            {
              id: "00000000-0000-4000-8000-000000000005",
              sessionId: "room:alice",
              roomId: "00000000-0000-4000-8000-000000000003",
              entityId: "alice",
              role: "user",
              text: "third",
              createdAt: "2026-01-01T00:00:02.000Z",
            },
            {
              id: "00000000-0000-4000-8000-000000000006",
              sessionId: "room:alice",
              roomId: "00000000-0000-4000-8000-000000000003",
              entityId: "agent",
              role: "assistant",
              text: "fourth",
              createdAt: "2026-01-01T00:00:03.000Z",
            },
            {
              id: "00000000-0000-4000-8000-000000000007",
              sessionId: "room:alice",
              roomId: "00000000-0000-4000-8000-000000000003",
              entityId: "alice",
              role: "user",
              text: "fifth",
              createdAt: "2026-01-01T00:00:04.000Z",
            },
          ],
          replaceSessionMessages,
        } as never,
        contextCompression: {
          measure: () => ({ estimatedTokens: 1 }),
        } as never,
        trajectoryEvaluation: {
          recordEvent: vi.fn(),
        } as never,
      },
    });

    await expect(
      executeSlashCommand(createInput("/compress"), context, {
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(abortError);
    expect(runModelAnalysis).toHaveBeenCalledTimes(1);
    expect(replaceSessionMessages).not.toHaveBeenCalled();
    expect(createMemory).not.toHaveBeenCalled();
    expect(deleteMemory).not.toHaveBeenCalled();
  });

  it("routes explicit commands through the SDK message lifecycle", async () => {
    let effectiveInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = vi.fn(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        effectiveInput = nextInput;
        return "post-result";
      },
    );

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/help"),
      createContext(),
      { personalityId: "analyst" },
    );

    expect(response).toBe("post-result");
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(effectiveInput?.message).toBe("/help");
  });

  it("falls back to post-command flow for non-command input", async () => {
    let effectiveInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = vi.fn(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        effectiveInput = nextInput;
        return "post-result";
      },
    );

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("how are you?"),
      createContext(),
    );

    expect(response).toBe("post-result");
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(effectiveInput).toMatchObject({
      message: "how are you?",
      source: "cli",
    });
  });

  it("skips slash command layer when workflow remaps command input", async () => {
    let effectiveInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = vi.fn(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        effectiveInput = nextInput;
        return "post-result";
      },
    );

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands({
      resolveWorkflowCommandPrompt: () => ({
        command: "/workflow-run",
        prompt: "run diagnostics on workspace",
      }),
    });

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/workflow run"),
      createContext(),
    );

    expect(response).toBe("post-result");
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(effectiveInput?.message).toBe("run diagnostics on workspace");
  });

  it("lets unknown slash input continue through the SDK lifecycle", async () => {
    const runPostCommandTurn = vi.fn(async () => "post-result");

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/unknown"),
      createContext(),
    );

    expect(response).toBe("post-result");
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
  });

  it("retries the latest conversational turn without routing through slash command storage", async () => {
    let retryInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = vi.fn(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        retryInput = nextInput;
        return "retried-result";
      },
    );
    const deleteLatestExchange = vi.fn(() => ({
      sessionId: "room:alice",
      userMessage: {
        id: "msg-1",
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "alice",
        role: "user",
        text: "ship the operator loop",
        createdAt: "2026-05-13T00:00:00.000Z",
      },
      assistantMessages: [],
      deletedMessages: 2,
    }));

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/retry"),
      createContext({
        services: {
          ...createContext().services,
          sessions: {
            ...retryProjectionSupport(),
            deleteLatestExchange,
          },
        },
      } as unknown as Partial<AgentExecutionContext>),
    );

    expect(response).toBe("retried-result");
    expect(deleteLatestExchange).toHaveBeenCalledWith("room:alice", {
      skipSlashCommands: true,
    });
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(retryInput?.message).toBe("ship the operator loop");
  });

  it("does not retry when a partial native exchange deletion is rolled back", async () => {
    const firstId = "00000000-0000-4000-8000-000000000041";
    const secondId = "00000000-0000-4000-8000-000000000042";
    const native = new Map<
      string,
      { id: string; roomId: string; content: { text: string } }
    >([
      [
        firstId,
        { id: firstId, roomId: "room:alice", content: { text: "retry me" } },
      ],
      [
        secondId,
        { id: secondId, roomId: "room:alice", content: { text: "old answer" } },
      ],
    ]);
    const originalProjection = [
      {
        id: firstId,
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "alice",
        role: "user" as const,
        text: "retry me",
        createdAt: "2026-05-13T00:00:00.000Z",
      },
      {
        id: secondId,
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "agent-1",
        role: "assistant" as const,
        text: "old answer",
        createdAt: "2026-05-13T00:00:01.000Z",
      },
    ];
    const projection = retryProjectionSupport(originalProjection);
    const runPostCommandTurn = vi.fn(async () => "should-not-run");
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/retry"),
      createContext({
        runtime: {
          agentId: "agent-1",
          getMemories: async () => [...native.values()],
          createMemory: async (memory: {
            id: string;
            roomId: string;
            content: { text: string };
          }) => {
            native.set(memory.id, memory);
            return memory.id;
          },
          deleteMemory: async (id: string) => {
            if (id === secondId) throw new Error("delete failed");
            native.delete(id);
          },
        },
        services: {
          ...createContext().services,
          sessions: {
            ...projection,
            deleteLatestExchange: () => ({
              sessionId: "room:alice",
              userMessage: originalProjection[0],
              assistantMessages: [originalProjection[1]],
              deletedMessages: 2,
            }),
          },
        },
      } as unknown as Partial<AgentExecutionContext>),
    );

    expect(response).toBe(
      "The previous exchange could not be removed from native conversation history, so it was not retried.",
    );
    expect(runPostCommandTurn).not.toHaveBeenCalled();
    expect(projection.replaceSessionMessages).toHaveBeenCalledWith(
      "room:alice",
      originalProjection,
    );
    expect([...native.keys()].sort()).toEqual([firstId, secondId].sort());
  });

  it("restores the original native exchange and projection when retry replay aborts", async () => {
    const nativeId = "00000000-0000-4000-8000-000000000044";
    const originalProjection = [
      {
        id: nativeId,
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "alice",
        role: "user" as const,
        text: "retry me",
        createdAt: "2026-05-13T00:00:00.000Z",
      },
    ];
    let projected = structuredClone(originalProjection);
    const native = new Map<
      string,
      {
        id: string;
        agentId: string;
        roomId: string;
        entityId: string;
        content: { text: string; inReplyTo?: string };
        metadata: Record<string, unknown>;
      }
    >([
      [
        nativeId,
        {
          id: nativeId,
          agentId: "agent-1",
          roomId: "room:alice",
          entityId: "alice",
          content: { text: "retry me" },
          metadata: {},
        },
      ],
    ]);
    const abortError = new Error("replay cancelled");
    abortError.name = "AbortError";
    const runPostCommandTurn = vi.fn(async (...args: unknown[]) => {
      const prepared = args[6] as {
        turn: { messageId: string; roomId: string };
      };
      native.set(prepared.turn.messageId, {
        id: prepared.turn.messageId,
        agentId: "agent-1",
        roomId: prepared.turn.roomId,
        entityId: "alice",
        content: { text: "retry me" },
        metadata: {},
      });
      native.set("00000000-0000-4000-8000-000000000045", {
        id: "00000000-0000-4000-8000-000000000045",
        agentId: "agent-1",
        roomId: prepared.turn.roomId,
        entityId: "agent-1",
        content: {
          text: "partial answer",
          inReplyTo: createUniqueUuid(
            { agentId: "agent-1" } as never,
            prepared.turn.messageId,
          ),
        },
        metadata: {},
      });
      projected = [
        {
          ...originalProjection[0],
          id: prepared.turn.messageId,
          text: "partial retry projection",
        },
      ];
      throw abortError;
    });
    const replaceSessionMessages = vi.fn(
      (_sessionId: string, messages: typeof originalProjection) => {
        projected = structuredClone(messages);
      },
    );
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    await expect(
      handleAgentTurn(
        createInput("/retry"),
        createContext({
          runtime: {
            agentId: "agent-1",
            getMemories: async () => [...native.values()],
            createMemory: async (memory: { id: string }) => {
              native.set(memory.id, memory as never);
              return memory.id;
            },
            deleteMemory: async (id: string) => {
              native.delete(id);
            },
          },
          services: {
            ...createContext().services,
            sessions: {
              messagesBySession: () => structuredClone(projected),
              replaceSessionMessages,
              deleteLatestExchange: () => ({
                sessionId: "room:alice",
                userMessage: {
                  id: nativeId,
                  sessionId: "room:alice",
                  roomId: "room:alice",
                  entityId: "alice",
                  role: "user" as const,
                  text: "retry me",
                  createdAt: "2026-05-13T00:00:00.000Z",
                },
                assistantMessages: [],
                deletedMessages: 1,
              }),
            },
          },
        } as unknown as Partial<AgentExecutionContext>),
      ),
    ).rejects.toBe(abortError);

    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(native.has(nativeId)).toBe(true);
    expect([...native.keys()]).toEqual([nativeId]);
    expect(projected).toEqual(originalProjection);
    expect(replaceSessionMessages).toHaveBeenCalledWith(
      "room:alice",
      originalProjection,
    );
  });

  it("restores the exact projection when native retry rollback is incomplete", async () => {
    const nativeId = "00000000-0000-4000-8000-000000000046";
    const originalProjection = [
      {
        id: nativeId,
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "alice",
        role: "user" as const,
        text: "retry me",
        createdAt: "2026-05-13T00:00:00.000Z",
      },
    ];
    let projected = structuredClone(originalProjection);
    const native = new Map<
      string,
      {
        id: string;
        agentId: string;
        roomId: string;
        entityId: string;
        content: { text: string };
        metadata: Record<string, unknown>;
      }
    >([
      [
        nativeId,
        {
          id: nativeId,
          agentId: "agent-1",
          roomId: "room:alice",
          entityId: "alice",
          content: { text: "retry me" },
          metadata: {},
        },
      ],
    ]);
    let replayMessageId = "";
    const replayError = new Error("replay failed");
    const runPostCommandTurn = vi.fn(async (...args: unknown[]) => {
      const prepared = args[6] as {
        turn: { messageId: string; roomId: string };
      };
      replayMessageId = prepared.turn.messageId;
      native.set(replayMessageId, {
        id: replayMessageId,
        agentId: "agent-1",
        roomId: prepared.turn.roomId,
        entityId: "alice",
        content: { text: "retry me" },
        metadata: {},
      });
      projected = [
        {
          ...originalProjection[0],
          id: replayMessageId,
          text: "partial retry projection",
        },
      ];
      throw replayError;
    });
    const replaceSessionMessages = vi.fn(
      (_sessionId: string, messages: typeof originalProjection) => {
        projected = structuredClone(messages);
      },
    );
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    await expect(
      handleAgentTurn(
        createInput("/retry"),
        createContext({
          runtime: {
            agentId: "agent-1",
            getMemories: async () => [...native.values()],
            createMemory: async (memory: { id: string }) => {
              native.set(memory.id, memory as never);
              return memory.id;
            },
            deleteMemory: async (id: string) => {
              if (id === replayMessageId) {
                throw new Error("retry cleanup refused");
              }
              native.delete(id);
            },
          },
          services: {
            ...createContext().services,
            sessions: {
              messagesBySession: () => structuredClone(projected),
              replaceSessionMessages,
              deleteLatestExchange: () => ({
                sessionId: "room:alice",
                userMessage: originalProjection[0],
                assistantMessages: [],
                deletedMessages: 1,
              }),
            },
          },
        } as unknown as Partial<AgentExecutionContext>),
      ),
    ).rejects.toThrow(
      "Retry replay failed and its original exchange could not be fully restored.",
    );

    expect(native.has(nativeId)).toBe(true);
    expect(native.has(replayMessageId)).toBe(true);
    expect(projected).toEqual(originalProjection);
    expect(replaceSessionMessages).toHaveBeenCalledWith(
      "room:alice",
      originalProjection,
    );
  });

  it("restores managed attachments when retrying a prior turn", async () => {
    let retryInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = vi.fn(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        retryInput = nextInput;
        return "retried-with-attachment";
      },
    );
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-retry-attachment-"));
    const attachmentsDir = join(dataDir, "attachments");
    mkdirSync(attachmentsDir);
    const contents = Buffer.from("# Review");
    const descriptor = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      name: "review.md",
      kind: "document" as const,
      mimeType: "text/markdown",
      sizeBytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
    writeFileSync(join(attachmentsDir, `${descriptor.id}.md`), contents);
    writeFileSync(
      join(attachmentsDir, `${descriptor.id}.meta.json`),
      JSON.stringify({
        version: 1,
        ...descriptor,
        storedName: `${descriptor.id}.md`,
      }),
    );
    const media = {
      id: descriptor.id,
      url: `attachment://${descriptor.id}`,
      title: descriptor.name,
      source: "desktop",
      contentType: "document" as const,
      text: "# Review",
      _data: "IyBSZXZpZXc=",
      _mimeType: "text/markdown",
    };
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    try {
      const { handleAgentTurn } = await loadHandleAgentTurn();
      const response = await handleAgentTurn(
        createInput("/retry"),
        createContext({
          config: {
            workspaceDir: "/workspace/demo",
            dataDir,
          },
          services: {
            ...createContext().services,
            sessions: {
              ...retryProjectionSupport(),
              deleteLatestExchange: () => ({
                sessionId: "room:alice",
                userMessage: {
                  id: "msg-1",
                  sessionId: "room:alice",
                  roomId: "room:alice",
                  entityId: "alice",
                  role: "user",
                  text: "review this",
                  attachments: [descriptor],
                  createdAt: "2026-05-13T00:00:00.000Z",
                },
                assistantMessages: [],
                deletedMessages: 2,
              }),
            },
          },
        } as unknown as Partial<AgentExecutionContext>),
      );

      expect(response).toBe("retried-with-attachment");
      expect(retryInput?.attachments).toEqual([media]);
      expect(retryInput?.attachmentDescriptors).toEqual([descriptor]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("does not resolve local attachment bytes for imported archive descriptors on retry", async () => {
    const runPostCommandTurn = vi.fn(async () => "should-not-run");
    const nativeId = "00000000-0000-4000-8000-000000000043";
    const native = new Map([
      [
        nativeId,
        {
          id: nativeId,
          roomId: "room:alice",
          content: { text: "review this" },
        },
      ],
    ]);
    const deleteMemory = vi.fn(async (id: string) => {
      native.delete(id);
    });
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-retry-archive-"));
    const attachmentsDir = join(dataDir, "attachments");
    mkdirSync(attachmentsDir);
    const contents = Buffer.from("local bytes must remain private");
    const localDescriptor = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      name: "private.md",
      kind: "document" as const,
      mimeType: "text/markdown",
      sizeBytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
    writeFileSync(join(attachmentsDir, `${localDescriptor.id}.md`), contents);
    writeFileSync(
      join(attachmentsDir, `${localDescriptor.id}.meta.json`),
      JSON.stringify({
        version: 1,
        ...localDescriptor,
        storedName: `${localDescriptor.id}.md`,
      }),
    );
    const importedDescriptor = {
      ...localDescriptor,
      id: `archive:${"a".repeat(64)}`,
    };
    const originalProjection = [
      {
        id: nativeId,
        sessionId: "room:alice",
        roomId: "room:alice",
        entityId: "alice",
        role: "user" as const,
        text: "review this",
        attachments: [importedDescriptor],
        createdAt: "2026-05-13T00:00:00.000Z",
      },
    ];
    const projection = retryProjectionSupport(originalProjection);
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    try {
      const { handleAgentTurn } = await loadHandleAgentTurn();
      const response = await handleAgentTurn(
        createInput("/retry"),
        createContext({
          runtime: {
            agentId: "agent-1",
            getMemories: async () => [...native.values()],
            createMemory: async () => undefined,
            deleteMemory,
          },
          config: {
            workspaceDir: "/workspace/demo",
            dataDir,
          },
          services: {
            ...createContext().services,
            sessions: {
              ...projection,
              deleteLatestExchange: () => ({
                sessionId: "room:alice",
                userMessage: originalProjection[0],
                assistantMessages: [],
                deletedMessages: 2,
              }),
            },
          },
        } as unknown as Partial<AgentExecutionContext>),
      );

      expect(response).toBe(
        "The previous turn used attachments that are no longer available, so it was not retried.",
      );
      expect(runPostCommandTurn).not.toHaveBeenCalled();
      expect(deleteMemory).not.toHaveBeenCalled();
      expect([...native.keys()]).toEqual([nativeId]);
      expect(projection.replaceSessionMessages).toHaveBeenCalledWith(
        "room:alice",
        originalProjection,
      );
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("returns a truthful retry message when no prior conversational turn exists", async () => {
    const runPostCommandTurn = vi.fn(async () => "post-result");

    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/retry"),
      createContext({
        services: {
          ...createContext().services,
          sessions: {
            ...retryProjectionSupport(),
            deleteLatestExchange: () => ({
              sessionId: "room:alice",
              assistantMessages: [],
              deletedMessages: 0,
            }),
          },
        },
      } as unknown as Partial<AgentExecutionContext>),
    );

    expect(response).toBe(
      "No prior conversational turn is available to retry.",
    );
    expect(runPostCommandTurn).not.toHaveBeenCalled();
  });

  it("refuses retry before deletion when exact projection rollback is unavailable", async () => {
    const deleteLatestExchange = vi.fn();
    const runPostCommandTurn = vi.fn(async () => "should-not-run");
    vi.doMock("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/retry"),
      createContext({
        services: {
          ...createContext().services,
          sessions: {
            messagesBySession: () => [],
            deleteLatestExchange,
          },
        },
      } as unknown as Partial<AgentExecutionContext>),
    );

    expect(response).toBe(
      "Retry is unavailable because complete session rollback is not supported by this runtime.",
    );
    expect(deleteLatestExchange).not.toHaveBeenCalled();
    expect(runPostCommandTurn).not.toHaveBeenCalled();
  });
});
