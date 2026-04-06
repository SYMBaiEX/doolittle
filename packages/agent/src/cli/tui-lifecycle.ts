import type { CliExecutionResult, CliState } from "@/cli/execution";
import { restoreTerminalState } from "@/cli/render-utils";
import {
  formatRecoverableProviderError,
  isBenignCliShutdownError,
  isRecoverableProviderError,
} from "@/cli/runtime-errors";
import { currentSessionElapsed } from "@/cli/shell-chrome";
import type { AppContext } from "@/runtime/bootstrap";

export interface TuiLifecycleState {
  screenDestroyed: boolean;
  shuttingDown: boolean;
  requestedExitCode: number;
  exitAfterTurnCancellation: boolean;
  forceExitTimer: ReturnType<typeof setTimeout> | null;
  lastInterruptAt: number;
  activeTurnAbortController: AbortController | null;
  busy: boolean;
}

interface TuiLifecycleOptions {
  context: AppContext;
  state: CliState;
  screen: { destroy(): void };
  output: NodeJS.WriteStream;
  crashLogPath: string;
  lifecycleState: TuiLifecycleState;
  logFatal: (label: string, error: unknown) => void;
  stopBusySpinner: () => void;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  clearLiveResponse: () => void;
}

interface TuiLifecycleController {
  exitCli(exitCode?: number): void;
  handleSigint(): void;
  dispose(): void;
}

export function installTuiLifecycle(
  options: TuiLifecycleOptions,
): TuiLifecycleController {
  const {
    context,
    state,
    screen,
    output,
    crashLogPath,
    lifecycleState,
    logFatal,
    stopBusySpinner,
    appendActivity,
    pushNotice,
    pushResponseEntry,
    scheduleRefreshPanels,
    clearLiveResponse,
  } = options;

  const exitCli = (exitCode = 0) => {
    if (lifecycleState.shuttingDown) {
      return;
    }
    lifecycleState.shuttingDown = true;
    lifecycleState.requestedExitCode = exitCode;
    if (lifecycleState.forceExitTimer) {
      clearTimeout(lifecycleState.forceExitTimer);
      lifecycleState.forceExitTimer = null;
    }
    if (!lifecycleState.screenDestroyed) {
      screen.destroy();
    }
    restoreTerminalState(output);
    setTimeout(() => {
      process.exit(exitCode);
    }, 0);
  };

  const requestActiveTurnCancellation = (
    shouldExitAfterCancellation = false,
  ): boolean => {
    if (
      !lifecycleState.activeTurnAbortController ||
      lifecycleState.activeTurnAbortController.signal.aborted
    ) {
      return false;
    }
    lifecycleState.activeTurnAbortController.abort();
    lifecycleState.exitAfterTurnCancellation ||= shouldExitAfterCancellation;
    appendActivity(
      "stop",
      shouldExitAfterCancellation
        ? "Stopping the active turn and exiting."
        : "Cancellation requested for the active turn. Press Ctrl-C again to force exit.",
      "warning",
    );
    pushNotice(
      "status",
      shouldExitAfterCancellation
        ? "Stopping the current turn and exiting."
        : "Cancellation requested. Waiting for the current turn to stop. Press Ctrl-C again to force exit.",
    );
    scheduleRefreshPanels(0);
    return true;
  };

  const scheduleForcedTuiExit = (signal: string) => {
    if (lifecycleState.forceExitTimer) {
      return;
    }
    lifecycleState.forceExitTimer = setTimeout(() => {
      forceTerminateCli(signal);
    }, 750);
    lifecycleState.forceExitTimer.unref?.();
  };

  const forceTerminateCli = (signal: string) => {
    if (lifecycleState.shuttingDown) {
      restoreTerminalState(output);
      process.exit(signal === "SIGINT" ? 130 : 0);
    }
    lifecycleState.shuttingDown = true;
    lifecycleState.requestedExitCode = signal === "SIGINT" ? 130 : 0;
    if (lifecycleState.forceExitTimer) {
      clearTimeout(lifecycleState.forceExitTimer);
      lifecycleState.forceExitTimer = null;
    }
    if (!lifecycleState.screenDestroyed) {
      screen.destroy();
    }
    restoreTerminalState(output);
    output.write(
      `\n${context.config.agentName} received ${signal}. Exiting.\n`,
    );
    process.exit(signal === "SIGINT" ? 130 : 0);
  };

  const handleUncaughtException = (error: unknown) => {
    if (lifecycleState.shuttingDown && isBenignCliShutdownError(error)) {
      return;
    }
    if (!lifecycleState.screenDestroyed && isRecoverableProviderError(error)) {
      logFatal("recoverableRuntimeError", error);
      stopBusySpinner();
      lifecycleState.busy = false;
      const detail = formatRecoverableProviderError(error);
      appendActivity("runtime", detail, "error");
      pushResponseEntry(context.config.agentName, `Error: ${detail}`, {
        elapsed: currentSessionElapsed(context, state.activeSessionId),
      });
      clearLiveResponse();
      scheduleRefreshPanels(0);
      return;
    }
    logFatal("uncaughtException", error);
    if (!lifecycleState.screenDestroyed) {
      screen.destroy();
    }
    restoreTerminalState(output);
    output.write(`\nA fatal CLI error occurred. Crash log: ${crashLogPath}\n`);
    process.exit(1);
  };

  const handleUnhandledRejection = (error: unknown) => {
    if (lifecycleState.shuttingDown && isBenignCliShutdownError(error)) {
      return;
    }
    if (!lifecycleState.screenDestroyed && isRecoverableProviderError(error)) {
      logFatal("recoverableRuntimeRejection", error);
      stopBusySpinner();
      lifecycleState.busy = false;
      const detail = formatRecoverableProviderError(error);
      appendActivity("runtime", detail, "error");
      pushResponseEntry(context.config.agentName, `Error: ${detail}`, {
        elapsed: currentSessionElapsed(context, state.activeSessionId),
      });
      clearLiveResponse();
      scheduleRefreshPanels(0);
      return;
    }
    logFatal("unhandledRejection", error);
    if (!lifecycleState.screenDestroyed) {
      screen.destroy();
    }
    restoreTerminalState(output);
    output.write(
      `\nA fatal CLI rejection occurred. Crash log: ${crashLogPath}\n`,
    );
    process.exit(1);
  };

  const shouldIgnoreDuplicateInterrupt = () => {
    const now = Date.now();
    if (now - lifecycleState.lastInterruptAt < 150) {
      return true;
    }
    lifecycleState.lastInterruptAt = now;
    return false;
  };

  const handleSigint = () => {
    if (shouldIgnoreDuplicateInterrupt()) {
      return;
    }
    lifecycleState.requestedExitCode = 130;
    if (requestActiveTurnCancellation(true)) {
      scheduleForcedTuiExit("SIGINT");
      return;
    }
    forceTerminateCli("SIGINT");
  };

  const handleSigterm = () => {
    forceTerminateCli("SIGTERM");
  };

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);
  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);

  return {
    exitCli,
    handleSigint,
    dispose() {
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGTERM", handleSigterm);
      process.removeListener("uncaughtException", handleUncaughtException);
      process.removeListener("unhandledRejection", handleUnhandledRejection);
      if (lifecycleState.forceExitTimer) {
        clearTimeout(lifecycleState.forceExitTimer);
        lifecycleState.forceExitTimer = null;
      }
    },
  };
}
