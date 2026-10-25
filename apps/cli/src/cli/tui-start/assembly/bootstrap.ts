import { installTuiForeignOutput } from "../../tui-foreign-output";
import { installTuiInputLifecycle } from "../../tui-input-lifecycle";
import {
  createTuiStartSetup,
  type TuiStartSetupOptions,
  type TuiStartSetupResult,
} from "../setup";

interface TuiStartBootstrapDependencies {
  isScreenDestroyed: () => boolean;
  isShuttingDown: () => boolean;
  scheduleRefreshPanels: (delayMs?: number) => void;
  updateFooterHint: () => void;
}

export interface TuiStartBootstrapResult {
  surfaces: TuiStartSetupResult;
  tuiInputLifecycle: ReturnType<typeof installTuiInputLifecycle>;
  unsubscribers: Array<() => void>;
}

export function bootstrapTuiStartRuntime(
  options: TuiStartSetupOptions & TuiStartBootstrapDependencies,
): TuiStartBootstrapResult {
  const {
    logger,
    screen,
    widgets,
    tuiState,
    isScreenDestroyed,
    isShuttingDown,
    scheduleRefreshPanels,
    updateFooterHint,
  } = options;

  const surfaces = createTuiStartSetup(options);

  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    installTuiForeignOutput({
      logger: logger.child("foreign-output"),
      isScreenDestroyed,
      isShuttingDown,
      routeForeignActivity: surfaces.routeForeignActivity,
      flushDeferredForeignActivity: surfaces.flushDeferredForeignActivity,
      scheduleDeferredForeignRefresh: surfaces.scheduleDeferredForeignRefresh,
      scheduleRefreshPanels,
      textEntryFocused: () => surfaces.textEntryFocused(),
      overlaysOpen: () => tuiState.paletteOpen || tuiState.composerOpen,
    }),
  );

  const tuiInputLifecycle = installTuiInputLifecycle({
    inputBox: widgets.inputBox as never,
    activateTextEntry: () => {
      surfaces.activatePrimaryInput();
    },
    screen,
    refreshPanels: () => surfaces.refreshPanels(),
    renderAssistSuggestions: (value: string) => {
      surfaces.renderAssistSuggestions(value);
    },
    updateFooterHint: () => {
      updateFooterHint();
    },
  });

  return {
    surfaces,
    tuiInputLifecycle,
    unsubscribers,
  };
}
