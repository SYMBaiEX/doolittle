import { bootstrapTuiStartRuntime } from "./bootstrap";
import { composeTuiStartAssemblyResult } from "./compose-result";
import { installTuiStartControllers } from "./controllers";
import type { TuiStartAssemblyOptions, TuiStartAssemblyResult } from "./types";

export type { TuiStartAssemblyOptions, TuiStartAssemblyResult };

export function assembleTuiStartRuntime(
  options: TuiStartAssemblyOptions,
): TuiStartAssemblyResult {
  const bootstrap = bootstrapTuiStartRuntime({
    ...options,
    isScreenDestroyed: () => options.tuiState.screenDestroyed,
    isShuttingDown: () => options.tuiState.shuttingDown,
    scheduleRefreshPanels: (delayMs) =>
      bootstrap.surfaces.scheduleRefreshPanels(delayMs),
    updateFooterHint: () => {
      bootstrap.surfaces.updateFooterHint();
    },
  });

  const controllers = installTuiStartControllers({
    ...options,
    surfaces: bootstrap.surfaces,
    tuiInputLifecycle: {
      resetInputAfterQueue: () =>
        bootstrap.tuiInputLifecycle.resetInputAfterQueue(),
      restoreInputAfterRun: () =>
        bootstrap.tuiInputLifecycle.restoreInputAfterRun(),
      handleEmptyQueueSubmit: () =>
        bootstrap.tuiInputLifecycle.handleEmptyQueueSubmit(),
    },
  });

  return composeTuiStartAssemblyResult({
    surfaces: bootstrap.surfaces,
    disposeControllers: controllers.dispose,
    bootstrapUnsubscribers: bootstrap.unsubscribers,
  });
}
