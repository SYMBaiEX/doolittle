import { installTuiForeignOutput } from "../../tui-foreign-output";
import { installTuiInputLifecycle } from "../../tui-input-lifecycle";
import { createTuiStartSetup } from "../setup";
import { installTuiStartControllers } from "./controllers";
import type { TuiStartAssemblyOptions } from "./types";

export function assembleTuiStartRuntime(options: TuiStartAssemblyOptions) {
  const { logger, screen, widgets, tuiState } = options;
  const surfaces = createTuiStartSetup(options);
  let detachOutput: (() => void) | undefined;

  try {
    detachOutput = installTuiForeignOutput({
      logger: logger.child("foreign-output"),
      isScreenDestroyed: () => tuiState.screenDestroyed,
      isShuttingDown: () => tuiState.shuttingDown,
      routeForeignActivity: surfaces.routeForeignActivity,
      flushDeferredForeignActivity: surfaces.flushDeferredForeignActivity,
      scheduleDeferredForeignRefresh: surfaces.scheduleDeferredForeignRefresh,
      scheduleRefreshPanels: surfaces.scheduleRefreshPanels,
      textEntryFocused: surfaces.textEntryFocused,
      overlaysOpen: () => tuiState.paletteOpen || tuiState.composerOpen,
    });

    const controllers = installTuiStartControllers({
      ...options,
      surfaces,
      tuiInputLifecycle: installTuiInputLifecycle({
        inputBox: widgets.inputBox,
        activateTextEntry: surfaces.activatePrimaryInput,
        screen,
        refreshPanels: surfaces.refreshPanels,
        renderAssistSuggestions: surfaces.renderAssistSuggestions,
        updateFooterHint: surfaces.updateFooterHint,
      }),
    });

    return {
      ...surfaces,
      dispose() {
        try {
          surfaces.dispose();
        } finally {
          try {
            controllers.dispose();
          } finally {
            detachOutput?.();
          }
        }
      },
    };
  } catch (error) {
    try {
      detachOutput?.();
    } finally {
      surfaces.dispose();
    }
    throw error;
  }
}
