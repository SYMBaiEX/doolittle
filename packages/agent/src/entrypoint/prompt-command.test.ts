import { describe, expect, it, vi } from "vitest";
import type { CliExecutionResult } from "@/cli/execution";
import type { CliTurnEvent } from "@/cli/turn-events";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimePromptCommand } from "./prompt-command";

function createContext(): AppContext {
  return {
    config: {
      dataDir: "/tmp/doolittle-data",
    },
  } as AppContext;
}

describe("handleRuntimePromptCommand", () => {
  it("returns false when the current invocation does not need prompt execution", async () => {
    await expect(
      handleRuntimePromptCommand({
        command: "start",
        shellIsInteractive: true,
        context: createContext(),
      }),
    ).resolves.toBe(false);
  });

  it("runs json-stream prompts and finalizes the active job", async () => {
    const written: string[] = [];
    const markCliJobStarted = vi.fn(() => undefined);
    const appendCliJobEvent = vi.fn(() => {});
    const finalizeCliJob = vi.fn(() => undefined);
    const printOneShotResult = vi.fn(() => {});
    const runCliPromptWithEvents = vi.fn(
      async (
        _context: AppContext,
        _line: string,
        handlers?: {
          onEvent?: (event: CliTurnEvent) => Promise<void> | void;
        },
      ) => {
        await handlers?.onEvent?.({
          type: "result",
          timestamp: "2026-03-30T00:00:00.000Z",
          text: "ok",
          tone: "agent",
          shouldExit: false,
        });
        return {
          result: { text: "ok", tone: "agent" } as CliExecutionResult,
          sessionId: "session-1",
        };
      },
    );

    await expect(
      handleRuntimePromptCommand(
        {
          command: "exec",
          shellIsInteractive: true,
          immediatePrompt: "  review the repo  ",
          oneShot: {
            prompt: "review the repo",
            json: false,
            jsonStream: true,
            background: false,
            jobId: "job-1",
            sessionId: "session-1",
          },
          context: createContext(),
          runCliPromptWithEvents,
          writeStdout: (message) => {
            written.push(message);
          },
        },
        {
          markCliJobStarted,
          appendCliJobEvent,
          finalizeCliJob,
          encodeCliTurnEvent: (event) => JSON.stringify(event),
          printOneShotResult,
        },
      ),
    ).resolves.toBe(true);

    expect(runCliPromptWithEvents).toHaveBeenCalledTimes(1);
    expect(markCliJobStarted).toHaveBeenCalledWith(
      "/tmp/doolittle-data",
      "job-1",
      {
        pid: process.pid,
        sessionId: "session-1",
      },
    );
    expect(appendCliJobEvent).toHaveBeenCalledTimes(1);
    expect(finalizeCliJob).toHaveBeenCalledWith(
      "/tmp/doolittle-data",
      "job-1",
      "completed",
      0,
    );
    expect(written).toEqual([
      JSON.stringify({
        type: "result",
        timestamp: "2026-03-30T00:00:00.000Z",
        text: "ok",
        tone: "agent",
        shouldExit: false,
      }),
    ]);
    expect(printOneShotResult).not.toHaveBeenCalled();
  });

  it("runs one-shot prompts and prints the returned result", async () => {
    const printOneShotResult = vi.fn(() => {});
    const runCliPrompt = vi.fn(async () => {
      return { text: "done", tone: "success" } as CliExecutionResult;
    });

    await expect(
      handleRuntimePromptCommand(
        {
          command: "exec",
          shellIsInteractive: true,
          immediatePrompt: "summarize this repo",
          oneShot: {
            prompt: "summarize this repo",
            json: true,
            jsonStream: false,
            background: false,
          },
          context: createContext(),
          runCliPrompt,
        },
        {
          markCliJobStarted: vi.fn(() => undefined),
          appendCliJobEvent: vi.fn(() => {}),
          finalizeCliJob: vi.fn(() => undefined),
          encodeCliTurnEvent: (event) => JSON.stringify(event),
          printOneShotResult,
        },
      ),
    ).resolves.toBe(true);

    expect(runCliPrompt).toHaveBeenCalledWith(
      expect.anything(),
      "summarize this repo",
      { sessionId: undefined },
    );
    expect(printOneShotResult).toHaveBeenCalledWith(
      { text: "done", tone: "success" },
      true,
    );
  });

  it("runs top-level alias commands through the same prompt execution path", async () => {
    const printOneShotResult = vi.fn(() => {});
    const runCliPrompt = vi.fn(async () => {
      return { text: "status ok", tone: "success" } as CliExecutionResult;
    });

    await expect(
      handleRuntimePromptCommand(
        {
          command: "status",
          shellIsInteractive: true,
          immediatePrompt: "/status",
          context: createContext(),
          runCliPrompt,
        },
        {
          markCliJobStarted: vi.fn(() => undefined),
          appendCliJobEvent: vi.fn(() => {}),
          finalizeCliJob: vi.fn(() => undefined),
          encodeCliTurnEvent: (event) => JSON.stringify(event),
          printOneShotResult,
        },
      ),
    ).resolves.toBe(true);

    expect(runCliPrompt).toHaveBeenCalledWith(expect.anything(), "/status", {
      sessionId: undefined,
    });
    expect(printOneShotResult).toHaveBeenCalledWith(
      { text: "status ok", tone: "success" },
      false,
    );
  });
});
