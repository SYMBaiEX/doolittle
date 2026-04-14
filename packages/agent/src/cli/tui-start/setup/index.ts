import {
  createTuiStartAssemblyState,
  type TuiStartAssemblyHintOptions,
} from "../assembly-state";
import { createTuiStartInputSetup } from "./input";
import { createTuiStartPresentationSetup } from "./presentation";
import { createTuiStartRuntimeSurfaces } from "./runtime-surfaces";
import type { TuiStartSetupOptions, TuiStartSetupResult } from "./types";

export type { TuiStartSetupOptions, TuiStartSetupResult } from "./types";

export function createTuiStartSetup(
  options: TuiStartSetupOptions,
): TuiStartSetupResult {
  const { context, widgets, focusables, tuiState, overlayState } = options;
  const { inputBox } = widgets;

  const assemblyState = createTuiStartAssemblyState();

  const input = createTuiStartInputSetup({
    workspaceDir: context.config.workspaceDir,
    screen: options.screen,
    widgets,
    focusables,
    tuiState,
    overlayState,
    assemblyState,
  });

  const surfaces = createTuiStartRuntimeSurfaces({
    options,
    assemblyState,
    textEntryFocused: () => input.textEntryFocused(),
  });

  const presentation = createTuiStartPresentationSetup({
    options,
    assemblyState,
    appendActivity: surfaces.appendActivity,
    flushDeferredForeignActivity: surfaces.flushDeferredForeignActivity,
  });

  return {
    assemblyState,
    appendActivity: surfaces.appendActivity,
    pushNotice: surfaces.pushNotice,
    pushResponseEntry: surfaces.transcript.pushResponseEntry,
    clearLiveResponse: surfaces.transcript.clearLiveResponse,
    exportTranscript: surfaces.transcript.exportTranscript,
    getLiveResponse: surfaces.transcript.getLiveResponse,
    pushLiveToolEvent: surfaces.transcript.pushLiveToolEvent,
    refreshLiveResponse: surfaces.transcript.refreshLiveResponse,
    resetResponses: surfaces.transcript.resetResponses,
    setLiveResponse: surfaces.transcript.setLiveResponse,
    flushDeferredForeignActivity: surfaces.flushDeferredForeignActivity,
    scheduleDeferredForeignRefresh: surfaces.scheduleDeferredForeignRefresh,
    routeForeignActivity: surfaces.routeForeignActivity,
    renderCurrentControlDeck: presentation.renderCurrentControlDeck,
    renderTransportPanel: presentation.renderTransportPanel,
    renderExecutionPanel: presentation.renderExecutionPanel,
    renderFooterContent: presentation.renderFooterContent,
    setFooterHint: (hint: string, setupOptions?: { render?: boolean }) => {
      presentation.setFooterHint(hint, setupOptions);
    },
    refreshPanels: presentation.refreshPanels,
    scheduleRefreshPanels: presentation.scheduleRefreshPanels,
    updateFooterHint: (setupOptions?: TuiStartAssemblyHintOptions) => {
      assemblyState.updateFooterHint(setupOptions);
    },
    syncLayout: presentation.syncLayout,
    applyTheme: presentation.applyTheme,
    syncThemeFromSettings: presentation.syncThemeFromSettings,
    logFatal: surfaces.logFatal,
    activatePrimaryInput: () => {
      input.activateTextEntry(
        inputBox as import("../../tui-text-entry").InteractiveTextEntry,
      );
    },
    activateTextEntry: input.activateTextEntry,
    deactivateTextEntry: input.deactivateTextEntry,
    focusProcessingSurface: input.focusProcessingSurface,
    hasLiveTextEntryCompletion: input.hasLiveTextEntryCompletion,
    noteTextEntryActivity: input.noteTextEntryActivity,
    textEntryFocused: input.textEntryFocused,
    renderAssistSuggestions: presentation.renderAssistSuggestions,
    startBusySpinner: presentation.startBusySpinner,
    stopBusySpinner: presentation.stopBusySpinner,
    dispose: () => {
      presentation.stopBusySpinner();
      surfaces.tuiActivityFeed.dispose();
      input.overlays.closeComposer();
      input.overlays.closePalette();
    },
    overlays: input.overlays,
  };
}
