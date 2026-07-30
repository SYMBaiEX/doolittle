import { describe, expect, it, vi } from "vitest";
import type { CliState } from "./types";

const { handleAgentTurn } = vi.hoisted(() => ({
  handleAgentTurn: vi.fn(
    async (_input: unknown, _context: unknown, _options: unknown) =>
      "SDK command response",
  ),
}));
const { connectLinkedProvider } = vi.hoisted(() => ({
  connectLinkedProvider: vi.fn(async () => ({
    connected: true,
    activated: true,
    advice: { detail: "ready" },
  })),
}));

vi.mock("@/runtime/chat", () => ({ handleAgentTurn }));
vi.mock("@/runtime/linked-provider-accounts", () => ({
  connectLinkedProvider,
}));

import { executeCliInput } from "./dispatch";

function createState(): CliState {
  return { activeSessionId: "cli:active", notices: [] };
}

function createContext() {
  return {
    config: {
      agentName: "Doolittle",
      workspaceDir: "/workspace",
      dataDir: "/tmp/doolittle-cli-tests",
    },
    services: {
      sessions: {
        listTitled: () => [],
        resolveByTitle: () => undefined,
        rename: (sessionId: string, title: string) => ({ sessionId, title }),
      },
      terminal: {
        runStreamingLocal: async () => ({
          command: "codex login",
          stdout: "Login completed.",
          stderr: "",
          exitCode: 0,
          durationMs: 9,
        }),
      },
    },
  };
}

describe("CLI explicit command lifecycle", () => {
  it("routes a non-static slash command through the SDK message turn", async () => {
    vi.clearAllMocks();
    const progress = vi.fn();
    const notice = vi.fn();
    const controller = new AbortController();

    await expect(
      executeCliInput("/status", createContext() as never, createState(), {
        onResponseProgress: progress,
        onNotice: notice,
        abortSignal: controller.signal,
      }),
    ).resolves.toEqual({ text: "SDK command response", tone: "info" });

    expect(handleAgentTurn).toHaveBeenCalledWith(
      {
        message: "/status",
        userId: "local-user",
        roomId: "cli:active",
        source: "cli",
      },
      expect.any(Object),
      expect.objectContaining({
        abortSignal: controller.signal,
        onNotice: expect.any(Function),
        onResponseProgress: expect.any(Function),
      }),
    );
  });

  it("keeps CLI-owned static and session commands out of agent storage", async () => {
    vi.clearAllMocks();
    const state = createState();

    await expect(
      executeCliInput("/help", createContext() as never, state),
    ).resolves.toMatchObject({ tone: "info" });
    await expect(
      executeCliInput("/resume", createContext() as never, state),
    ).resolves.toEqual({
      text: "No titled sessions are available yet. Use /title <name> to name the current session.",
      tone: "info",
    });

    expect(handleAgentTurn).not.toHaveBeenCalled();
  });

  it("provides login shell streaming and auto-connect through the SDK turn hook", async () => {
    vi.clearAllMocks();
    await executeCliInput(
      "/accounts login codex",
      createContext() as never,
      createState(),
    );
    const turnOptions = handleAgentTurn.mock.calls[0]?.[2] as unknown as {
      runLocalShellCommand?: (params: {
        command: string;
        afterSuccessConnectProvider?: "codex";
      }) => Promise<string>;
    };

    await expect(
      turnOptions.runLocalShellCommand?.({
        command: "codex login",
        afterSuccessConnectProvider: "codex",
      }),
    ).resolves.toContain("codex is now connected and active.");
    expect(connectLinkedProvider).toHaveBeenCalledWith(
      expect.any(Object),
      "codex",
    );
  });
});
