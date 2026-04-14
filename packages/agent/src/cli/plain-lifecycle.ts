import type { Interface } from "node:readline/promises";
import { restoreTerminalState } from "@/cli/render-utils";
import {
  formatRecoverableProviderError,
  isBenignCliShutdownError,
  isRecoverableProviderError,
} from "@/cli/runtime-errors";
import { renderPlainRunLine } from "@/cli/shell-chrome";
import type { AppLogger } from "@/logging/logger";

export interface PlainCliLifecycleState {
  closed: boolean;
  requestedExitCode: number;
  activeTurnAbortController: AbortController | null;
  turnCancellationPending: boolean;
  forceExitTimer: ReturnType<typeof setTimeout> | null;
  cleanedUp: boolean;
  lastInterruptAt: number;
}

interface PlainCliLifecycleOptions {
  rl: Interface;
  output: NodeJS.WriteStream;
  interactiveShell: boolean;
  logger: AppLogger;
  unsubscribeRunUpdates: () => void;
}

interface PlainCliLifecycleController {
  cleanup(): void;
  handleRecoverableRuntimeError(error: unknown): boolean;
}

export function installPlainCliLifecycle(
  state: PlainCliLifecycleState,
  options: PlainCliLifecycleOptions,
): PlainCliLifecycleController {
  const { rl, output, interactiveShell, logger, unsubscribeRunUpdates } =
    options;
  const crashLogPath = logger.getCrashLogPath();

  const logFatal = (label: string, error: unknown) => {
    logger.captureError(label, error);
  };

  const requestActiveTurnCancellation = (): boolean => {
    if (
      !state.activeTurnAbortController ||
      state.activeTurnAbortController.signal.aborted
    ) {
      return false;
    }
    state.turnCancellationPending = true;
    state.activeTurnAbortController.abort();
    output.write(
      `${interactiveShell ? "\n" : ""}${renderPlainRunLine("cancel requested · waiting for the active turn to stop · press Ctrl-C again to force exit", "[!!]")}\n`,
    );
    return true;
  };

  const cleanup = () => {
    if (state.cleanedUp) {
      return;
    }
    state.cleanedUp = true;
    if (!state.closed) {
      rl.close();
    }
    unsubscribeRunUpdates();
    process.removeListener("uncaughtException", handleUncaughtException);
    process.removeListener("unhandledRejection", handleUnhandledRejection);
    process.removeListener("SIGINT", handleSigint);
    rl.removeListener("SIGINT", handleSigint);
    if (state.forceExitTimer) {
      clearTimeout(state.forceExitTimer);
      state.forceExitTimer = null;
    }
    restoreTerminalState(output);
  };

  // Forced termination is still intentional here: by the time we use it,
  // normal prompt-loop shutdown has already failed or been explicitly skipped.
  const forceTerminatePlainCli = (exitCode = 130) => {
    cleanup();
    process.exit(exitCode);
  };

  const scheduleForcedPlainExit = (exitCode = 130) => {
    if (state.forceExitTimer) {
      return;
    }
    state.forceExitTimer = setTimeout(() => {
      forceTerminatePlainCli(exitCode);
    }, 750);
    state.forceExitTimer.unref?.();
  };

  const handleRecoverableRuntimeError = (error: unknown): boolean => {
    if (state.closed && isBenignCliShutdownError(error)) {
      return true;
    }
    if (state.closed || !isRecoverableProviderError(error)) {
      return false;
    }
    logFatal("plain-cli-recoverable", error);
    output.write(
      `\nRuntime error: ${formatRecoverableProviderError(error)}\n\n`,
    );
    return true;
  };

  const handleUncaughtException = (error: unknown) => {
    if (handleRecoverableRuntimeError(error)) {
      return;
    }
    logFatal("plain-cli-uncaughtException", error);
    output.write(`\nFatal CLI error. Crash log: ${crashLogPath}\n`);
    if (!state.closed) {
      rl.close();
    }
  };

  const handleUnhandledRejection = (error: unknown) => {
    if (handleRecoverableRuntimeError(error)) {
      return;
    }
    logFatal("plain-cli-unhandledRejection", error);
    output.write(`\nFatal CLI rejection. Crash log: ${crashLogPath}\n`);
    if (!state.closed) {
      rl.close();
    }
  };

  const shouldIgnoreDuplicateInterrupt = () => {
    const now = Date.now();
    if (now - state.lastInterruptAt < 150) {
      return true;
    }
    state.lastInterruptAt = now;
    return false;
  };

  const handleSigint = () => {
    if (shouldIgnoreDuplicateInterrupt()) {
      return;
    }
    state.requestedExitCode = 130;
    if (requestActiveTurnCancellation()) {
      if (!state.closed) {
        rl.close();
      }
      scheduleForcedPlainExit(130);
      return;
    }
    if (state.turnCancellationPending) {
      forceTerminatePlainCli(130);
    }
    if (!state.closed) {
      rl.close();
      return;
    }
    forceTerminatePlainCli(130);
  };

  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("SIGINT", handleSigint);
  rl.on("SIGINT", handleSigint);

  return {
    cleanup,
    handleRecoverableRuntimeError,
  };
}
