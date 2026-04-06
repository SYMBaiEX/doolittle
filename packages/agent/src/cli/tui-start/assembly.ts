import { bootstrapTuiStartRuntime } from "./assembly/bootstrap";
import { composeTuiStartAssemblyResult } from "./assembly/compose-result";
import { installTuiStartControllers } from "./assembly/controllers";
import type {
  TuiStartAssemblyOptions,
  TuiStartAssemblyResult,
} from "./assembly/types";

export type { TuiStartAssemblyOptions, TuiStartAssemblyResult };

export function assembleTuiStartRuntime(
  options: TuiStartAssemblyOptions,
): TuiStartAssemblyResult {
  const {
    context,
    state,
    logger,
    screen,
    output,
    crashLogPath,
    transcriptExportPath,
    widgets,
    focusables,
    tuiState,
    lifecycleState,
    queueState,
    overlayState,
    getActiveTheme,
    setActiveTheme,
    isConversationalInput,
    truncate,
    canCopyToClipboard,
  } = options;

  const bootstrap = bootstrapTuiStartRuntime({
    tuiState,
    context,
    state,
    logger,
    screen,
    output,
    crashLogPath,
    transcriptExportPath,
    widgets,
    focusables,
    overlayState,
    getActiveTheme,
    setActiveTheme,
    isConversationalInput,
    truncate,
    canCopyToClipboard,
    isScreenDestroyed: () => tuiState.screenDestroyed,
    isShuttingDown: () => tuiState.shuttingDown,
    scheduleRefreshPanels: (delayMs) =>
      bootstrap.surfaces.scheduleRefreshPanels(delayMs),
    updateFooterHint: () => {
      bootstrap.surfaces.updateFooterHint();
    },
  });

  const controllers = installTuiStartControllers({
    context,
    state,
    logger,
    screen,
    output,
    crashLogPath,
    tuiState,
    lifecycleState,
    queueState,
    widgets,
    focusables,
    surfaces: bootstrap.surfaces,
    tuiInputLifecycle: {
      resetInputAfterQueue: () =>
        bootstrap.tuiInputLifecycle.resetInputAfterQueue(),
      restoreInputAfterRun: () =>
        bootstrap.tuiInputLifecycle.restoreInputAfterRun(),
      handleEmptyQueueSubmit: () =>
        bootstrap.tuiInputLifecycle.handleEmptyQueueSubmit(),
    },
    isConversationalInput,
  });

  return composeTuiStartAssemblyResult({
    surfaces: bootstrap.surfaces,
    disposeControllers: controllers.dispose,
    bootstrapUnsubscribers: bootstrap.unsubscribers,
  });
}
