import { describe, expect, it } from "bun:test";
import type { CliExecutionResult, CliState } from "@/cli/execution";
import { processPlainCliLine } from "@/cli/plain-loop/process-line";
import type { PlainCliLoopExecutionState } from "@/cli/plain-loop/types";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";

function createContext(agentName = "Doolittle") {
  return {
    config: {
      agentName,
    },
    services: {
      runController: {
        getActive: () => null,
      },
    },
  } as const;
}

describe("processPlainCliLine", () => {
  it("records conversational input and agent output", async () => {
    const context = createContext();
    const state: CliState = { activeSessionId: "cli:test", notices: [] };
    const responseHistory: ResponseTranscriptEntry[] = [];
    const emitted: Array<{
      entry: ResponseTranscriptEntry;
      tone?: CliExecutionResult["tone"];
    }> = [];
    const persisted: string[] = [];
    const executionState: PlainCliLoopExecutionState = {
      activeTurnAbortController: null,
      turnCancellationPending: false,
    };

    const result = await processPlainCliLine({
      context: context as never,
      state,
      interactiveShell: true,
      line: "hello there",
      responseHistory,
      executionState,
      pushPlainEntry: (entry, tone) => {
        emitted.push({ entry, tone });
      },
      persistTranscript: (history) => {
        persisted.push(history.map((entry) => entry.label).join(","));
      },
      nowStamp: () => "10:00:00",
      getElapsed: () => "1s",
      executeInput: async () => ({
        text: "hi",
        tone: "agent",
      }),
    });

    expect(result.shouldExit).toBe(false);
    expect(responseHistory).toEqual([
      {
        label: "You",
        body: "hello there",
        at: "10:00:00",
        kind: "user",
      },
    ]);
    expect(persisted).toEqual(["You"]);
    expect(emitted).toEqual([
      {
        entry: {
          label: "Doolittle",
          body: "hi",
          at: "10:00:00",
          elapsed: "1s",
          kind: "assistant",
        },
        tone: "agent",
      },
    ]);
    expect(executionState.activeTurnAbortController).toBeNull();
    expect(executionState.turnCancellationPending).toBe(false);
  });

  it("labels slash-command results as command output", async () => {
    const context = createContext();
    const state: CliState = { activeSessionId: "cli:test", notices: [] };
    const emitted: Array<ResponseTranscriptEntry> = [];

    await processPlainCliLine({
      context: context as never,
      state,
      interactiveShell: true,
      line: "/help",
      responseHistory: [],
      executionState: {
        activeTurnAbortController: null,
        turnCancellationPending: false,
      },
      pushPlainEntry: (entry) => {
        emitted.push(entry);
      },
      persistTranscript: () => {},
      nowStamp: () => "10:00:00",
      getElapsed: () => undefined,
      executeInput: async () => ({
        text: "usage",
        tone: "info",
      }),
    });

    expect(emitted[0]).toEqual({
      label: "Command Result",
      body: "usage",
      at: "10:00:00",
      elapsed: undefined,
      kind: "command",
    });
  });

  it("exits after a non-interactive result", async () => {
    const context = createContext();
    const state: CliState = { activeSessionId: "cli:test", notices: [] };

    const result = await processPlainCliLine({
      context: context as never,
      state,
      interactiveShell: false,
      line: "!pwd",
      responseHistory: [],
      executionState: {
        activeTurnAbortController: null,
        turnCancellationPending: false,
      },
      pushPlainEntry: () => {},
      persistTranscript: () => {},
      executeInput: async () => ({
        text: "/tmp",
        tone: "success",
      }),
    });

    expect(result.shouldExit).toBe(true);
  });

  it("pushes a system error entry when execution fails", async () => {
    const context = createContext();
    const state: CliState = { activeSessionId: "cli:test", notices: [] };
    const emitted: Array<{
      entry: ResponseTranscriptEntry;
      tone?: CliExecutionResult["tone"];
    }> = [];
    const executionState: PlainCliLoopExecutionState = {
      activeTurnAbortController: null,
      turnCancellationPending: true,
    };

    const result = await processPlainCliLine({
      context: context as never,
      state,
      interactiveShell: true,
      line: "hello",
      responseHistory: [],
      executionState,
      pushPlainEntry: (entry, tone) => {
        emitted.push({ entry, tone });
      },
      persistTranscript: () => {},
      nowStamp: () => "10:00:00",
      getElapsed: () => "2s",
      executeInput: async () => {
        throw new Error("boom");
      },
    });

    expect(result.shouldExit).toBe(false);
    expect(emitted).toEqual([
      {
        entry: {
          label: "Error",
          body: "boom",
          at: "10:00:00",
          elapsed: "2s",
          kind: "system",
        },
        tone: "error",
      },
    ]);
    expect(executionState.activeTurnAbortController).toBeNull();
    expect(executionState.turnCancellationPending).toBe(false);
  });
});
