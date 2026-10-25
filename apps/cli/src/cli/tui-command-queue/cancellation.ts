import type { TuiCommandQueueOptions, TuiCommandQueueState } from "./types";

interface FinalizeQueueTurnOptions
  extends Pick<
    TuiCommandQueueOptions,
    | "stopBusySpinner"
    | "flushDeferredForeignActivity"
    | "restoreInputAfterRun"
    | "onRecoveryFailure"
    | "requestExit"
  > {
  queueState: TuiCommandQueueState;
  processNext: () => void;
}

export async function finalizeQueueTurn(
  options: FinalizeQueueTurnOptions,
): Promise<void> {
  options.queueState.activeTurnAbortController = null;
  options.queueState.busy = false;
  options.stopBusySpinner();

  const shouldExitAfterRun = options.queueState.exitAfterTurnCancellation;
  options.queueState.exitAfterTurnCancellation = false;

  if (!options.queueState.screenDestroyed && !shouldExitAfterRun) {
    let recoveryFailed = false;
    try {
      options.flushDeferredForeignActivity();
      await options.restoreInputAfterRun();
    } catch (error) {
      recoveryFailed = true;
      options.onRecoveryFailure(error);
    }
    if (!recoveryFailed) {
      options.processNext();
    }
  }

  if (shouldExitAfterRun) {
    options.requestExit(options.queueState.requestedExitCode || 130);
  }
}
