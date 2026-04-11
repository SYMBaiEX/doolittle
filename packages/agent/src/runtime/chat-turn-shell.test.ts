import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runShellPostCommandTurn } from "./chat-turn/shell";

function createBaseContext(
  runtimeOverrides: Record<string, unknown> = {},
): AgentExecutionContext {
  return {
    runtime: {
      character: { name: "Doolittle" },
      ...runtimeOverrides,
    },
    services: {
      executionApprovals: {
        latestPendingForSession: () => null,
      },
      runController: {
        startTurn: () => undefined,
        noteActionCompleted: () => undefined,
        noteActionStarted: () => undefined,
        setPendingApprovals: () => undefined,
        finishTurn: () => undefined,
      },
      sessions: {
        storeMessage: () => undefined,
        continuityKey: () => "continuity-key",
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
      userProfiles: {
        observe: async () => undefined,
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;
}

function createPerf() {
  const flushes: Array<{ path: string; sessionId: string; source: string }> =
    [];
  return {
    mark: () => undefined,
    flush: (logger: undefined | unknown, metadata: Record<string, unknown>) => {
      void logger;
      if (
        typeof metadata.path === "string" &&
        typeof metadata.sessionId === "string" &&
        typeof metadata.source === "string"
      ) {
        flushes.push({
          path: metadata.path,
          sessionId: metadata.sessionId,
          source: metadata.source,
        });
      }
    },
    flushes,
  };
}

describe("chat turn shell seam", () => {
  it("ignores non-shell messages", async () => {
    const context = createBaseContext();
    const perf = createPerf();

    const response = await runShellPostCommandTurn({
      input: { userId: "alice", message: "hello", source: "cli" },
      effectiveInput: { userId: "alice", message: "hello", source: "cli" },
      context,
      perf,
    });

    expect(response).toBeUndefined();
    expect(perf.flushes).toHaveLength(0);
  });

  it("returns usage string when shell marker has no command", async () => {
    const runEvents: string[] = [];
    const context = createBaseContext();
    context.services.sessions.storeMessage = (message: { text: string }) => {
      runEvents.push(`stored:${message.text}`);
    };
    const baseRunController = context.services.runController;
    context.services.runController = {
      ...baseRunController,
      startTurn: baseRunController.startTurn,
      noteActionStarted: baseRunController.noteActionStarted,
      noteActionCompleted: baseRunController.noteActionCompleted,
      setPendingApprovals: baseRunController.setPendingApprovals,
      finishTurn: (sessionId: string, status: string) => {
        runEvents.push(`finish:${sessionId}:${status}`);
      },
    } as unknown as typeof baseRunController;
    const perf = createPerf();
    const response = await runShellPostCommandTurn({
      input: { userId: "alice", message: "!", source: "cli" },
      effectiveInput: { userId: "alice", message: "!", source: "cli" },
      context,
      perf,
    });

    expect(response).toBe("Usage: !<shell command>");
    expect(runEvents).toContain("finish:room:alice:complete");
    expect(runEvents).toContain("stored:Usage: !<shell command>");
    expect(perf.flushes).toEqual([
      {
        path: "shell-usage-error",
        sessionId: "room:alice",
        source: "cli",
      },
    ]);
  });

  it("returns approval prompt when shell execution needs confirmation", async () => {
    const runEvents: string[] = [];
    const context = createBaseContext();
    const baseRunController = context.services.runController;
    context.services.runController = {
      ...baseRunController,
      setPendingApprovals: (sessionId: string, count: number) => {
        runEvents.push(`pending:${sessionId}:${count}`);
      },
      finishTurn: (sessionId: string, status: string) => {
        runEvents.push(`finish:${sessionId}:${status}`);
      },
    } as unknown as typeof baseRunController;
    const perf = createPerf();

    const response = await runShellPostCommandTurn(
      {
        input: { userId: "alice", message: "!cat", source: "cli" },
        effectiveInput: { userId: "alice", message: "!cat", source: "cli" },
        context,
        perf,
      },
      {
        maybeRequireRemoteExecutionApproval: async () => "approve this action",
        runShellCommandForTurn: async () => {
          throw new Error("should not run");
        },
        formatShellCommandResponse: (result) => JSON.stringify(result),
      },
    );

    expect(response).toBe("approve this action");
    expect(runEvents).toContain("pending:room:alice:1");
    expect(runEvents).toContain("finish:room:alice:complete");
    expect(perf.flushes).toEqual([
      {
        path: "shell-approval",
        sessionId: "room:alice",
        source: "cli",
      },
    ]);
  });

  it("executes shell command and returns formatted output", async () => {
    const updates: string[] = [];
    const runEvents: string[] = [];
    const context = createBaseContext();
    const baseRunController = context.services.runController;
    context.services.runController = {
      ...baseRunController,
      noteActionStarted: (sessionId: string, action: string) => {
        runEvents.push(`start:${sessionId}:${action}`);
      },
      noteActionCompleted: (sessionId: string, action: string | undefined) => {
        runEvents.push(`complete:${sessionId}:${action}`);
      },
      finishTurn: (sessionId: string, status: string) => {
        runEvents.push(`finish:${sessionId}:${status}`);
      },
      setPendingApprovals: () => undefined,
    } as unknown as typeof baseRunController;
    context.services.sessions.storeMessage = (message: { text: string }) => {
      runEvents.push(`stored:${message.text}`);
    };
    const perf = createPerf();

    const response = await runShellPostCommandTurn(
      {
        input: {
          userId: "alice",
          message: "!ls -la",
          source: "cli",
          roomId: "custom-room",
        },
        effectiveInput: {
          userId: "alice",
          message: "!ls -la",
          source: "cli",
          roomId: "custom-room",
        },
        context,
        options: {
          onResponseProgress: async (update) => {
            updates.push(update.phase);
          },
        },
        perf,
      },
      {
        maybeRequireRemoteExecutionApproval: async () => undefined,
        runShellCommandForTurn: async () => ({
          command: "ls -la",
          exitCode: 0,
          stdout: "ok",
        }),
        formatShellCommandResponse: (result) => `formatted:${result.exitCode}`,
      },
    );

    expect(response).toBe("formatted:0");
    expect(runEvents).toContain("start:custom-room:shell:ls -la");
    expect(runEvents).toContain("complete:custom-room:shell:ls -la");
    expect(runEvents).toContain("finish:custom-room:complete");
    expect(runEvents).toContain("stored:formatted:0");
    expect(updates).toEqual(["command"]);
    expect(perf.flushes).toEqual([
      {
        path: "shell-command",
        sessionId: "custom-room",
        source: "cli",
      },
    ]);
  });
});
