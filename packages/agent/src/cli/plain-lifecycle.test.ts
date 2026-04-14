import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import {
  installPlainCliLifecycle,
  type PlainCliLifecycleState,
} from "@/cli/plain-lifecycle";
import type { AppLogger } from "@/logging/logger";

class FakeReadline extends EventEmitter {
  public closeCount = 0;

  close() {
    this.closeCount += 1;
  }
}

function createState(
  overrides: Partial<PlainCliLifecycleState> = {},
): PlainCliLifecycleState {
  return {
    closed: false,
    requestedExitCode: 0,
    activeTurnAbortController: null,
    turnCancellationPending: false,
    forceExitTimer: null,
    cleanedUp: false,
    lastInterruptAt: 0,
    ...overrides,
  };
}

function createLogger() {
  const captured: Array<{ label: string; error: unknown }> = [];
  const logger = {
    captureError: (label: string, error: unknown) => {
      captured.push({ label, error });
    },
    getCrashLogPath: () => "/tmp/plain-cli-crash.log",
  } as AppLogger;

  return { logger, captured };
}

function createOutput() {
  const writes: string[] = [];
  return {
    writes,
    stream: {
      write(chunk: string) {
        writes.push(String(chunk));
        return true;
      },
    } as NodeJS.WriteStream,
  };
}

const originalProcessExit = process.exit;

afterEach(() => {
  (process as typeof process & { exit: typeof process.exit }).exit =
    originalProcessExit;
});

describe("installPlainCliLifecycle", () => {
  it("prints and logs recoverable runtime errors without closing the prompt", () => {
    const rl = new FakeReadline();
    const state = createState();
    const { logger, captured } = createLogger();
    const { writes, stream } = createOutput();
    let unsubscribed = 0;

    const controller = installPlainCliLifecycle(state, {
      rl: rl as never,
      output: stream,
      interactiveShell: true,
      logger,
      unsubscribeRunUpdates: () => {
        unsubscribed += 1;
      },
    });

    const handled = controller.handleRecoverableRuntimeError(
      new Error("Unauthorized request to provider"),
    );

    expect(handled).toBe(true);
    expect(captured).toEqual([
      {
        label: "plain-cli-recoverable",
        error: expect.any(Error),
      },
    ]);
    expect(writes.join("")).toContain(
      "Runtime error: Unauthorized request to provider",
    );
    expect(rl.closeCount).toBe(0);

    controller.cleanup();
    expect(unsubscribed).toBe(1);
    expect(state.cleanedUp).toBe(true);
  });

  it("treats benign shutdown errors as handled once the cli is already closed", () => {
    const rl = new FakeReadline();
    const state = createState({ closed: true });
    const { logger, captured } = createLogger();
    const { writes, stream } = createOutput();

    const controller = installPlainCliLifecycle(state, {
      rl: rl as never,
      output: stream,
      interactiveShell: false,
      logger,
      unsubscribeRunUpdates: () => {},
    });

    const handled = controller.handleRecoverableRuntimeError(
      new Error("readline was closed"),
    );

    expect(handled).toBe(true);
    expect(captured).toEqual([]);
    expect(writes).toEqual([]);
    expect(rl.closeCount).toBe(0);

    controller.cleanup();
  });

  it("aborts the active turn and schedules forced exit on the first interrupt", () => {
    const rl = new FakeReadline();
    const state = createState({
      activeTurnAbortController: new AbortController(),
    });
    const { logger } = createLogger();
    const { writes, stream } = createOutput();

    const controller = installPlainCliLifecycle(state, {
      rl: rl as never,
      output: stream,
      interactiveShell: true,
      logger,
      unsubscribeRunUpdates: () => {},
    });

    rl.emit("SIGINT");

    expect(state.requestedExitCode).toBe(130);
    expect(state.activeTurnAbortController?.signal.aborted).toBe(true);
    expect(state.turnCancellationPending).toBe(true);
    expect(state.forceExitTimer).not.toBeNull();
    expect(rl.closeCount).toBe(1);
    expect(writes.join("")).toContain("cancel requested");

    controller.cleanup();
    expect(state.forceExitTimer).toBeNull();
  });

  it("forces process exit when interruption repeats after cancellation is pending", () => {
    const rl = new FakeReadline();
    const state = createState({
      closed: true,
      turnCancellationPending: true,
    });
    const { logger } = createLogger();
    const { writes, stream } = createOutput();
    const exitCodes: number[] = [];

    (process as typeof process & { exit: typeof process.exit }).exit = ((
      code?: number,
    ) => {
      exitCodes.push(code ?? 0);
      throw new Error("__PLAIN_EXIT__");
    }) as typeof process.exit;

    installPlainCliLifecycle(state, {
      rl: rl as never,
      output: stream,
      interactiveShell: false,
      logger,
      unsubscribeRunUpdates: () => {},
    });

    expect(() => rl.emit("SIGINT")).toThrow("__PLAIN_EXIT__");

    expect(exitCodes).toEqual([130]);
    expect(state.cleanedUp).toBe(true);
    expect(writes.join("")).toContain("\u001b[0m");
  });
});
