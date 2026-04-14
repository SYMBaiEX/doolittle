import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
  const module = await import(
    `./chat?runtime-chat-test=${Date.now()}-${Math.random()}`
  );
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
  mock.module("@/runtime/workflow-commands", () => ({
    getWorkflowCommandCatalogEntries: () => [],
    renderWorkflowCommandCatalog: () => "workflow-catalog",
    listWorkflowCommands: () => [],
    resolveWorkflowCommandPrompt:
      overrides?.resolveWorkflowCommandPrompt ?? (() => undefined),
  }));
}

describe("chat turn orchestration", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("returns slash command responses and skips post-command execution", async () => {
    const runSlashCommandTurn = mock(async () => "slash-result");
    const runPostCommandTurn = mock(async () => "post-result");

    mock.module("@/runtime/chat-turn/command", () => ({ runSlashCommandTurn }));
    mock.module("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/help"),
      createContext(),
      { personalityId: "analyst" },
    );

    expect(response).toBe("slash-result");
    expect(runSlashCommandTurn).toHaveBeenCalledTimes(1);
    expect(runPostCommandTurn).not.toHaveBeenCalled();
  });

  it("falls back to post-command flow for non-command input", async () => {
    const runSlashCommandTurn = mock(async () => "should-not-run");
    let effectiveInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = mock(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        effectiveInput = nextInput;
        return "post-result";
      },
    );

    mock.module("@/runtime/chat-turn/command", () => ({ runSlashCommandTurn }));
    mock.module("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("how are you?"),
      createContext(),
    );

    expect(response).toBe("post-result");
    expect(runSlashCommandTurn).not.toHaveBeenCalled();
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(effectiveInput).toMatchObject({
      message: "how are you?",
      source: "cli",
    });
  });

  it("skips slash command layer when workflow remaps command input", async () => {
    const runSlashCommandTurn = mock(async () => "slash-result");
    let effectiveInput: ChatTurnRequest | undefined;
    const runPostCommandTurn = mock(
      async (_input: ChatTurnRequest, nextInput: ChatTurnRequest) => {
        effectiveInput = nextInput;
        return "post-result";
      },
    );

    mock.module("@/runtime/chat-turn/command", () => ({ runSlashCommandTurn }));
    mock.module("@/runtime/chat-turn/post-command", () => ({
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
    expect(runSlashCommandTurn).not.toHaveBeenCalled();
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
    expect(effectiveInput?.message).toBe("run diagnostics on workspace");
  });

  it("falls back to post-command when slash command does not return output", async () => {
    const runSlashCommandTurn = mock(async () => undefined);
    const runPostCommandTurn = mock(async () => "post-result");

    mock.module("@/runtime/chat-turn/command", () => ({ runSlashCommandTurn }));
    mock.module("@/runtime/chat-turn/post-command", () => ({
      runPostCommandTurn,
    }));
    mockWorkflowCommands();

    const { handleAgentTurn } = await loadHandleAgentTurn();
    const response = await handleAgentTurn(
      createInput("/unknown"),
      createContext(),
    );

    expect(response).toBe("post-result");
    expect(runSlashCommandTurn).toHaveBeenCalledTimes(1);
    expect(runPostCommandTurn).toHaveBeenCalledTimes(1);
  });
});
