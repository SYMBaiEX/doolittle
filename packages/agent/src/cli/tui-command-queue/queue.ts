import { finalizeQueueTurn } from "./cancellation";
import { resolveQueuedHistoryLabel } from "./entries";
import { createTuiCommandHistory } from "./history";
import {
  createQueueExecutionHooks,
  handleQueuedError,
  handleQueuedResult,
  wireQueuedResponse,
} from "./response-wiring";
import type {
  TuiCommandQueueController,
  TuiCommandQueueOptions,
} from "./types";

export function installTuiCommandQueue(
  options: TuiCommandQueueOptions,
): TuiCommandQueueController {
  const commandHistory = createTuiCommandHistory();
  const pendingCommands: string[] = [];

  const processQueue = async (): Promise<void> => {
    if (options.queueState.busy || pendingCommands.length === 0) {
      return;
    }

    options.queueState.busy = true;
    options.startBusySpinner();
    options.focusProcessingSurface();
    options.queueState.queueDepth = pendingCommands.length;
    await options.refreshPanels();

    const line = pendingCommands.shift();
    options.queueState.queueDepth = pendingCommands.length;

    if (!line) {
      options.queueState.busy = false;
      await options.refreshPanels();
      return;
    }

    const { label, kind, isShellCommand } = wireQueuedResponse(
      line,
      options.context,
      options,
    );

    try {
      options.queueState.activeTurnAbortController = new AbortController();
      const result = await options.executeInput(
        line,
        options.context,
        options.state,
        {
          abortSignal: options.queueState.activeTurnAbortController.signal,
          ...createQueueExecutionHooks({
            label,
            kind,
            isShellCommand,
            appendActivity: options.appendActivity,
            getLiveResponse: options.getLiveResponse,
            setLiveResponse: options.setLiveResponse,
            pushNotice: options.pushNotice,
            scheduleRefreshPanels: options.scheduleRefreshPanels,
          }),
        },
      );
      const completion = await handleQueuedResult({
        context: options.context,
        state: options.state,
        line,
        result,
        appendActivity: options.appendActivity,
        pushResponseEntry: options.pushResponseEntry,
        syncThemeFromSettings: options.syncThemeFromSettings,
        destroyScreen: options.destroyScreen,
      });
      if (completion.shouldExit) {
        return;
      }
    } catch (error) {
      handleQueuedError({
        context: options.context,
        state: options.state,
        line,
        error,
        appendActivity: options.appendActivity,
        pushResponseEntry: options.pushResponseEntry,
        logger: options.logger,
      });
    } finally {
      await finalizeQueueTurn({
        queueState: options.queueState,
        stopBusySpinner: options.stopBusySpinner,
        flushDeferredForeignActivity: options.flushDeferredForeignActivity,
        restoreInputAfterRun: options.restoreInputAfterRun,
        onRecoveryFailure: options.onRecoveryFailure,
        requestExit: options.requestExit,
        processNext: () => {
          void processQueue();
        },
      });
    }
  };

  return {
    queueCommand(line) {
      const trimmed = line.trim();
      if (!trimmed) {
        options.handleEmptyQueueSubmit();
        return;
      }

      commandHistory.record(trimmed);
      const historyLabel = resolveQueuedHistoryLabel(
        trimmed,
        options.isConversationalInput,
      );
      if (historyLabel) {
        options.pushResponseEntry(historyLabel, trimmed);
      }
      pendingCommands.push(trimmed);
      options.queueState.queueDepth = pendingCommands.length;
      options.resetInputAfterQueue();
      void processQueue();
    },
    historyBack() {
      return commandHistory.back();
    },
    historyForward() {
      return commandHistory.forward();
    },
    hasHistory() {
      return commandHistory.hasHistory();
    },
  };
}
