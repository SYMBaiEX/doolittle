import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import { runShellPostCommandTurn } from "./shell";

type RecordedPerfMetadata = {
  path: string;
  sessionId: string;
  source: string;
};

type ShellCallEvents = string[];

type TestContextState = {
  startCalls: Array<{ sessionId: string; runId: string }>;
  completeCalls: Array<{ sessionId: string; status: string; reason?: string }>;
  actionCalls: string[];
  setPendingApprovals: string[];
  storedMessages: string[];
};

type ExecResult = {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

function createContext(state: TestContextState): AgentExecutionContext {
  return {
    runtime: {
      character: { name: "Doolittle" },
      logger: { info: () => undefined },
    },
    services: {
      executionApprovals: {
        latestPendingForSession: () => null,
      },
      runController: {
        startTurn: (payload: { sessionId: string; runId: string }) => {
          state.startCalls.push({
            sessionId: payload.sessionId,
            runId: payload.runId,
          });
        },
        noteActionStarted: (sessionId: string, action: string) => {
          state.actionCalls.push(`start:${sessionId}:${action}`);
        },
        noteActionCompleted: (sessionId: string, action: string) => {
          state.actionCalls.push(`complete:${sessionId}:${action}`);
        },
        setPendingApprovals: (sessionId: string, count: number) => {
          state.setPendingApprovals.push(`${sessionId}:${count}`);
        },
        finishTurn: (sessionId: string, status: string, reason?: string) => {
          state.completeCalls.push({
            sessionId,
            status,
            reason,
          });
        },
      },
      sessions: {
        storeMessage: (message: { text: string }) => {
          state.storedMessages.push(message.text);
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
      userProfiles: {
        observe: async () => undefined,
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;
}

function createPerf() {
  const flushed: RecordedPerfMetadata[] = [];
  return {
    mark: (phase: string) => {
      flushed.push({ path: `mark:${phase}`, sessionId: "", source: "" });
    },
    flush: (
      _logger: unknown,
      metadata: { path: string; sessionId: string; source: string },
    ) => {
      flushed.push(metadata);
    },
    flushed,
  };
}

function makeRequest(message: string, source: ChatTurnRequest["source"] = "cli") {
  return {
    userId: "alice",
    message,
    source,
  } satisfies ChatTurnRequest;
}

describe("chat-turn/shell edge cases", () => {
  it("ignores shell runner when message is not command marker", async () => {
    const state = {
      startCalls: [],
      completeCalls: [],
      actionCalls: [],
      setPendingApprovals: [],
      storedMessages: [],
    };
    const context = createContext(state);
    const perf = createPerf();

    const response = await runShellPostCommandTurn({
      input: makeRequest("I am talking normally"),
      effectiveInput: makeRequest("I am talking normally"),
      context,
      perf,
      preparedTurn: undefined,
    });

    expect(response).toBeUndefined();
    expect(state.startCalls).toHaveLength(0);
    expect(state.completeCalls).toHaveLength(0);
    expect(state.actionCalls).toHaveLength(0);
    expect(state.storedMessages).toHaveLength(0);
    expect(perf.flushed).toHaveLength(0);
  });

  it("treats pure ! as usage error and records assistant response lifecycle", async () => {
    const state: TestContextState = {
      startCalls: [],
      completeCalls: [],
      actionCalls: [],
      setPendingApprovals: [],
      storedMessages: [],
    };
    const context = createContext(state);
    const perf = createPerf();

    const response = await runShellPostCommandTurn({
      input: makeRequest("   !\n"),
      effectiveInput: makeRequest("   !\n"),
      context,
      perf,
    });

    expect(response).toBe("Usage: !<shell command>");
    expect(state.startCalls).toHaveLength(1);
    expect(state.actionCalls).toHaveLength(0);
    expect(state.completeCalls).toEqual([
      { sessionId: "room:alice", status: "complete" },
    ]);
    expect(state.storedMessages).toEqual([
      "   !\n",
      "Usage: !<shell command>",
    ]);
    expect(perf.flushed).toEqual([
      {
        path: "shell-usage-error",
        sessionId: "room:alice",
        source: "cli",
      },
    ]);
  });

  it("parses leading whitespace and executes shell command", async () => {
    const state: TestContextState = {
      startCalls: [],
      completeCalls: [],
      actionCalls: [],
      setPendingApprovals: [],
      storedMessages: [],
    };
    const context = createContext(state);
    const perf = createPerf();
    let sawCommand = "";
    const response = await runShellPostCommandTurn(
      {
        input: makeRequest("!   ls -la /tmp"),
        effectiveInput: makeRequest("!   ls -la /tmp"),
        context,
        perf,
      },
      {
        maybeRequireRemoteExecutionApproval: async () => undefined,
        runShellCommandForTurn: async (command) => {
          sawCommand = command;
          return {
            command,
            exitCode: 0,
            stdout: "ok",
          } as ExecResult;
        },
        formatShellCommandResponse: (result: ExecResult) =>
          `rc:${result.exitCode} out:${result.stdout}`,
      },
    );

    expect(response).toBe("rc:0 out:ok");
    expect(sawCommand).toBe("ls -la /tmp");
    expect(state.actionCalls).toEqual([
      "start:room:alice:shell:ls -la /tmp",
      "complete:room:alice:shell:ls -la /tmp",
    ]);
    expect(state.completeCalls).toEqual([
      { sessionId: "room:alice", status: "complete" },
    ]);
    expect(state.storedMessages).toEqual([
      "!   ls -la /tmp",
      "rc:0 out:ok",
    ]);
    expect(perf.flushed).toContainEqual({
      path: "shell-command",
      sessionId: "room:alice",
      source: "cli",
    });
  });

  it("requests approval before execution and marks pending approvals", async () => {
    const state: TestContextState = {
      startCalls: [],
      completeCalls: [],
      actionCalls: [],
      setPendingApprovals: [],
      storedMessages: [],
    };
    const context = createContext(state);
    const perf = createPerf();

    const response = await runShellPostCommandTurn(
      {
        input: makeRequest("!dangerous"),
        effectiveInput: makeRequest("!dangerous"),
        context,
        perf,
      },
      {
        maybeRequireRemoteExecutionApproval: async () => "approve this action first",
        runShellCommandForTurn: async () => {
          throw new Error("should not execute");
        },
        formatShellCommandResponse: () => "",
      },
    );

    expect(response).toBe("approve this action first");
    expect(state.setPendingApprovals).toEqual(["room:alice:1"]);
    expect(state.completeCalls).toEqual([
      { sessionId: "room:alice", status: "complete" },
    ]);
    expect(state.storedMessages).toEqual([
      "!dangerous",
      "approve this action first",
    ]);
    expect(state.actionCalls).toHaveLength(0);
    expect(perf.flushed).toEqual([
      {
        path: "shell-approval",
        sessionId: "room:alice",
        source: "cli",
      },
    ]);
  });

  it("fails fast when execution throws and marks turn as error", async () => {
    const state: TestContextState = {
      startCalls: [],
      completeCalls: [],
      actionCalls: [],
      setPendingApprovals: [],
      storedMessages: [],
    };
    const context = createContext(state);
    const perf = createPerf();

    await expect(
      runShellPostCommandTurn(
        {
          input: makeRequest("!cat missing"),
          effectiveInput: makeRequest("!cat missing"),
          context,
          perf,
        },
        {
          maybeRequireRemoteExecutionApproval: async () => undefined,
          runShellCommandForTurn: async () => {
            throw new Error("exec failed");
          },
          formatShellCommandResponse: () => "",
        },
      ),
    ).rejects.toThrow("exec failed");

    expect(state.actionCalls).toEqual([
      "start:room:alice:shell:cat missing",
      "complete:room:alice:shell:cat missing",
    ]);
    expect(state.completeCalls).toEqual([
      { sessionId: "room:alice", status: "error", reason: "exec failed" },
    ]);
    expect(perf.flushed).toEqual([]);
    expect(state.storedMessages).toEqual(["!cat missing"]);
  });
});
