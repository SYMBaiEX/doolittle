import type blessed from "blessed";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";
import { installTuiForeignOutput } from "../../tui-foreign-output";
import { installTuiInputLifecycle } from "../../tui-input-lifecycle";
import type { TuiOverlayState } from "../../tui-overlays";
import type { TuiStateStore } from "../../tui-state";
import type { TuiWidgetSet } from "../../tui-widget-factory";
import { createTuiStartSetup, type TuiStartSetupResult } from "../setup";
import type { TuiStartAssemblyOptions } from "./types";

interface TuiStartBootstrapOptions {
  context: AppContext;
  state: TuiStartAssemblyOptions["state"];
  logger: AppLogger;
  screen: blessed.Widgets.Screen;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  transcriptExportPath: string;
  widgets: TuiWidgetSet;
  focusables: blessed.Widgets.BlessedElement[];
  tuiState: TuiStateStore;
  overlayState: TuiOverlayState;
  getActiveTheme: () => TuiThemeProfile;
  setActiveTheme: (theme: TuiThemeProfile) => void;
  isConversationalInput: (text: string) => boolean;
  truncate: (text: string, maxLength: number) => string;
  canCopyToClipboard: boolean;
}

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
  options: TuiStartBootstrapOptions & TuiStartBootstrapDependencies,
): TuiStartBootstrapResult {
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
    overlayState,
    getActiveTheme,
    setActiveTheme,
    truncate,
    canCopyToClipboard,
    isScreenDestroyed,
    isShuttingDown,
    scheduleRefreshPanels,
    updateFooterHint,
  } = options;

  const surfaces = createTuiStartSetup({
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
    overlayState,
    getActiveTheme,
    setActiveTheme,
    isConversationalInput: options.isConversationalInput,
    truncate,
    canCopyToClipboard,
  });

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
