import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("forwards a cancelled /compress analysis signal and does not mutate history", async () => {
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
        controller.abort();
        throw abortError;
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
});
