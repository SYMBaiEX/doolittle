import type { CliExecutionResult, CliState } from "@/cli/execution";
import {
  formatRecoverableProviderError,
  isBenignCliShutdownError,
  isRecoverableProviderError,
} from "@/cli/runtime-errors";
import { currentSessionElapsed } from "@/cli/shell-chrome";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiLifecycleState } from "./types";

interface TuiRecoverableRuntimeErrorDependencies {
  context: AppContext;
  state: CliState;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  lifecycleState: TuiLifecycleState;
  exitCli: (exitCode?: number) => void;
  logFatal: (label: string, error: unknown) => void;
  stopBusySpinner: () => void;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  clearLiveResponse: () => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
}

export interface TuiRecoverableRuntimeErrorHandlers {
  handleUncaughtException(error: unknown): void;
  handleUnhandledRejection(error: unknown): void;
}

export function createRecoverableRuntimeErrorHandlers(
  dependencies: TuiRecoverableRuntimeErrorDependencies,
): TuiRecoverableRuntimeErrorHandlers {
  const {
    context,
    state,
    output,
    crashLogPath,
    lifecycleState,
    exitCli,
    logFatal,
    stopBusySpinner,
    appendActivity,
    pushResponseEntry,
    clearLiveResponse,
    scheduleRefreshPanels,
  } = dependencies;

  const handleRecoverableRuntimeError = (
    error: unknown,
    recoverableLabel: string,
  ): boolean => {
    if (lifecycleState.shuttingDown && isBenignCliShutdownError(error)) {
      return true;
    }
    if (lifecycleState.screenDestroyed || !isRecoverableProviderError(error)) {
      return false;
    }
    logFatal(recoverableLabel, error);
    stopBusySpinner();
    lifecycleState.busy = false;
    const detail = formatRecoverableProviderError(error);
    appendActivity("runtime", detail, "error");
    pushResponseEntry(context.config.agentName, `Error: ${detail}`, {
      elapsed: currentSessionElapsed(context, state.activeSessionId),
    });
    clearLiveResponse();
    scheduleRefreshPanels(0);
    return true;
  };

  const handleUncaughtException = (error: unknown) => {
    if (handleRecoverableRuntimeError(error, "recoverableRuntimeError")) {
      return;
    }
    logFatal("uncaughtException", error);
    exitCli(1);
    output.write(`\nA fatal CLI error occurred. Crash log: ${crashLogPath}\n`);
  };

  const handleUnhandledRejection = (error: unknown) => {
    if (handleRecoverableRuntimeError(error, "recoverableRuntimeRejection")) {
      return;
    }
    logFatal("unhandledRejection", error);
    exitCli(1);
    output.write(
      `\nA fatal CLI rejection occurred. Crash log: ${crashLogPath}\n`,
    );
  };

  return {
    handleUncaughtException,
    handleUnhandledRejection,
  };
}
