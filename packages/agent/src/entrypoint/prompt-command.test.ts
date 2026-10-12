import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliExecutionResult } from "@/cli/execution";
import type { CliTurnEvent } from "@/cli/turn-events";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimePromptCommand } from "./prompt-command";

const previousCodingVerificationOptIn =
  process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
const previousExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = previousExitCode;
  if (previousCodingVerificationOptIn === undefined)
    delete process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
  else
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION =
      previousCodingVerificationOptIn;
});

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
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
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
        options?: { codingVerificationReceipts?: boolean },
      ) => {
        expect(options?.codingVerificationReceipts).toBe(false);
        await handlers?.onEvent?.({
          type: "coding-verification",
          timestamp: "2026-03-30T00:00:00.000Z",
          verifier: "sum-finite-v1",
          status: "verified",
          reason: "verified",
          shellStarts: 1,
          shellCompletions: 1,
          verifierMatches: 1,
          success: true,
          exitCode: 0,
          timedOut: false,
          truncated: false,
          workdirMatches: true,
          actionPairMatched: true,
        });
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
          jobControlNonce: "test-nonce",
          onCancelRequested: () => undefined,
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
          monitorJobCancel: () => () => undefined,
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
    expect(written).toEqual([]);
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
      { sessionId: undefined, abortSignal: undefined },
    );
    expect(printOneShotResult).toHaveBeenCalledWith(
      { text: "done", tone: "success", status: "completed" },
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
      abortSignal: undefined,
    });
    expect(printOneShotResult).toHaveBeenCalledWith(
      { text: "status ok", tone: "success", status: "completed" },
      false,
    );
  });

  it("does not mark a resolved error result as a completed background job", async () => {
    const finalizeCliJob = vi.fn();
    await handleRuntimePromptCommand(
      {
        command: "exec",
        shellIsInteractive: false,
        immediatePrompt: "task",
        oneShot: {
          json: false,
          jsonStream: true,
          background: false,
          jobId: "job-error",
        },
        context: createContext(),
        jobControlNonce: "test-nonce",
        onCancelRequested: () => undefined,
        runCliPromptWithEvents: async () => ({
          result: { text: "permission denied", tone: "error" },
          sessionId: "session-error",
        }),
      },
      {
        markCliJobStarted: vi.fn(),
        appendCliJobEvent: vi.fn(),
        finalizeCliJob,
        encodeCliTurnEvent: JSON.stringify,
        printOneShotResult: vi.fn(),
        monitorJobCancel: () => () => undefined,
      },
    );
    expect(finalizeCliJob).toHaveBeenCalledWith(
      "/tmp/doolittle-data",
      "job-error",
      "failed",
      1,
    );
    expect(process.exitCode).toBe(1);
  });

  it("propagates cancelled resolved one-shot exit status and JSON evidence", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const controller = new AbortController();
    const runCliPrompt = vi.fn(async () => {
      controller.abort();
      return { text: "stopped", tone: "agent" } as CliExecutionResult;
    });

    await handleRuntimePromptCommand({
      command: "exec",
      shellIsInteractive: false,
      immediatePrompt: "task",
      oneShot: { json: true, jsonStream: false, background: false },
      context: createContext(),
      abortSignal: controller.signal,
      runCliPrompt,
    });

    expect(process.exitCode).toBe(130);
    expect(JSON.parse(output.mock.calls[0]?.[0])).toMatchObject({
      ok: false,
      text: "stopped",
    });
  });

  it("passes the lifecycle cancellation signal into a streamed turn", async () => {
    const controller = new AbortController();
    const runCliPromptWithEvents = vi.fn(
      async (_context, _line, _handlers, options) => {
        expect(options.abortSignal).toBe(controller.signal);
        controller.abort();
        throw new Error("cancelled");
      },
    );
    await handleRuntimePromptCommand({
      command: "exec",
      shellIsInteractive: false,
      immediatePrompt: "task",
      oneShot: { json: false, jsonStream: true, background: false },
      context: createContext(),
      abortSignal: controller.signal,
      runCliPromptWithEvents,
    });
    expect(process.exitCode).toBe(130);
  });
});
