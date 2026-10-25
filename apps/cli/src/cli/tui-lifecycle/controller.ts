import { createTuiExitHandler } from "./exit-handler";
import { createRecoverableRuntimeErrorHandlers } from "./recoverable-runtime-handler";
import { createTuiSignalHandlers } from "./signal-handler";
import type { TuiLifecycleController, TuiLifecycleOptions } from "./types";

export function createTuiLifecycleController(
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

  const {
    exitCli,
    forceTerminateCli,
    scheduleForcedTuiExit,
    clearForceExitTimer,
  } = createTuiExitHandler({
    context,
    screen,
    output,
    lifecycleState,
  });

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

  const { handleUncaughtException, handleUnhandledRejection } =
    createRecoverableRuntimeErrorHandlers({
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
    });

  const { handleSigint, handleSigterm } = createTuiSignalHandlers({
    lifecycleState,
    requestActiveTurnCancellation,
    scheduleForcedTuiExit,
    forceTerminateCli,
  });

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
      clearForceExitTimer();
    },
  };
}
