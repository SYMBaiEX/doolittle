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
