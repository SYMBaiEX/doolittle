import type blessed from "blessed";
import type { CliExecutionResult, CliState } from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";
import { createTuiActivityFeed } from "../tui-activity-feed";
import type { TuiOverlayState } from "../tui-overlays";
import { installTuiOverlays } from "../tui-overlays";
import type { TuiStateStore } from "../tui-state";
import {
  createTuiTextEntryController,
  type InteractiveTextEntry,
} from "../tui-text-entry";
import { createTuiTranscriptController } from "../tui-transcript";
import type { TuiWidgetSet } from "../tui-widget-factory";
import {
  createTuiStartAssemblyState,
  type TuiStartAssemblyHintOptions,
  type TuiStartAssemblyState,
} from "./assembly-state";
import { createTuiStartFatalLogger } from "./boot/fatal-logger";
import { createTuiStartPresentation } from "./boot/presentation";

export interface TuiStartSetupOptions {
  context: AppContext;
  state: CliState;
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

export interface TuiStartSetupResult {
  assemblyState: TuiStartAssemblyState;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  clearLiveResponse: () => void;
  exportTranscript: () => void;
  getLiveResponse: () => ResponseTranscriptEntry | undefined;
  pushLiveToolEvent: (detail: string) => void;
  refreshLiveResponse: () => void;
  resetResponses: () => void;
  setLiveResponse: (
    label: string,
    body: string,
    options?: {
      kind?: ResponseTranscriptEntry["kind"];
      pending?: boolean;
    },
  ) => void;
  flushDeferredForeignActivity: () => void;
  scheduleDeferredForeignRefresh: (delayMs?: number) => void;
  routeForeignActivity: (
    source: "stdout" | "stderr" | "console",
    text: string,
  ) => void;
  renderCurrentControlDeck: () => Promise<void>;
  renderTransportPanel: () => Promise<string>;
  renderExecutionPanel: () => Promise<string>;
  renderFooterContent: () => string;
  setFooterHint: (hint: string, options?: { render?: boolean }) => void;
  refreshPanels: () => Promise<void>;
  scheduleRefreshPanels: (delayMs?: number) => void;
  updateFooterHint: (options?: TuiStartAssemblyHintOptions) => void;
  syncLayout: () => void;
  applyTheme: () => void;
  syncThemeFromSettings: () => Promise<void>;
  logFatal: (label: string, error: unknown) => void;
  activatePrimaryInput: () => void;
  activateTextEntry: (entry: InteractiveTextEntry) => void;
  deactivateTextEntry: (entry: InteractiveTextEntry) => void;
  focusProcessingSurface: () => void;
  hasLiveTextEntryCompletion: (entry: InteractiveTextEntry) => boolean;
  noteTextEntryActivity: () => void;
  textEntryFocused: () => boolean;
  renderAssistSuggestions: (value: string) => void;
  startBusySpinner: () => void;
  stopBusySpinner: () => void;
  dispose: () => void;
  overlays: ReturnType<typeof installTuiOverlays>;
}

export function createTuiStartSetup(
  options: TuiStartSetupOptions,
): TuiStartSetupResult {
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
  } = options;
  const {
    activity,
    response,
    paletteOverlay,
    paletteInput,
    paletteList,
    composerOverlay,
    composer,
    inputBox,
  } = widgets;

  const assemblyState = createTuiStartAssemblyState();

  const tuiActivityFeed = createTuiActivityFeed({
    activityPane: activity,
    state,
    shouldDeferForeignActivity: () =>
      textEntryFocused() || tuiState.paletteOpen || tuiState.composerOpen,
    scheduleRefreshPanels: (delayMs = 120) => {
      assemblyState.scheduleRefreshPanels(delayMs);
    },
  });
  const {
    appendActivity,
    flushDeferredForeignActivity,
    pushNotice,
    routeForeignActivity,
    scheduleDeferredForeignRefresh,
  } = tuiActivityFeed;

  const {
    clearLiveResponse,
    exportTranscript,
    getLiveResponse,
    pushLiveToolEvent,
    pushResponseEntry,
    refreshLiveResponse,
    resetResponses,
    setLiveResponse,
  } = createTuiTranscriptController({
    context,
    state,
    responsePane: response,
    transcriptExportPath,
    appendActivity,
    pushNotice,
    scheduleRefreshPanels: (delayMs) => {
      assemblyState.scheduleRefreshPanels(delayMs);
    },
    truncate,
    isBusy: () => tuiState.busy,
    canCopyToClipboard,
  });

  const logFatal = createTuiStartFatalLogger({
    logger,
    output,
    crashLogPath,
    tuiState,
    appendActivity,
    pushResponseEntry,
    truncate,
  });

  const tuiTextEntry = createTuiTextEntryController({
    screen,
    state: tuiState,
    inputBox: inputBox as InteractiveTextEntry,
    composer: composer as InteractiveTextEntry,
    paletteInput: paletteInput as InteractiveTextEntry,
    responsePane: response,
    primaryFocusIndex: focusables.length - 1,
    renderScreen: () => {
      screen.render();
    },
    updateFooterHint: () => {
      assemblyState.updateFooterHint();
    },
    getLastTextEntryAt: () => tuiState.lastTextEntryAt,
    setLastTextEntryAt: (value) => {
      tuiState.lastTextEntryAt = value;
    },
  });
  const {
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    focusProcessingSurface,
    hasLiveTextEntryCompletion,
    noteTextEntryActivity,
    textEntryFocused,
  } = tuiTextEntry;

  const overlays = installTuiOverlays({
    workspaceDir: context.config.workspaceDir,
    paletteOverlay,
    paletteInput,
    paletteList,
    composerOverlay,
    composer,
    inputBox,
    overlayState,
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    updateFooterHint: (updateOptions) => {
      assemblyState.updateFooterHint(updateOptions);
    },
    noteTextEntryActivity,
    queueCommand: (line) => {
      assemblyState.queueCommand(line);
    },
    screenRender: () => {
      screen.render();
    },
  });
  const presentation = createTuiStartPresentation({
    context,
    state,
    screen,
    widgets,
    tuiState,
    logger: logger.child("presentation"),
    getActiveTheme,
    setActiveTheme,
    appendActivity,
    flushDeferredForeignActivity,
    truncate,
  });
  assemblyState.setUpdateFooterHint(presentation.updateFooterHint);
  assemblyState.setRefreshPanels(() => presentation.refreshPanels());
  assemblyState.setScheduleRefreshPanels((delayMs = 120) => {
    presentation.scheduleRefreshPanels(delayMs);
  });

  return {
    assemblyState,
    appendActivity,
    pushNotice,
    pushResponseEntry,
    clearLiveResponse,
    exportTranscript,
    getLiveResponse,
    pushLiveToolEvent,
    refreshLiveResponse,
    resetResponses,
    setLiveResponse,
    flushDeferredForeignActivity,
    scheduleDeferredForeignRefresh,
    routeForeignActivity,
    renderCurrentControlDeck: presentation.renderCurrentControlDeck,
    renderTransportPanel: presentation.renderTransportPanel,
    renderExecutionPanel: presentation.renderExecutionPanel,
    renderFooterContent: presentation.renderFooterContent,
    setFooterHint: (hint: string, options?: { render?: boolean }) => {
      presentation.setFooterHint(hint, options);
    },
    refreshPanels: presentation.refreshPanels,
    scheduleRefreshPanels: presentation.scheduleRefreshPanels,
    updateFooterHint: (options?: TuiStartAssemblyHintOptions) => {
      assemblyState.updateFooterHint(options);
    },
    syncLayout: presentation.syncLayout,
    applyTheme: presentation.applyTheme,
    syncThemeFromSettings: presentation.syncThemeFromSettings,
    logFatal,
    activatePrimaryInput: () => {
      activateTextEntry(inputBox as InteractiveTextEntry);
    },
    activateTextEntry,
    deactivateTextEntry,
    focusProcessingSurface,
    hasLiveTextEntryCompletion,
    noteTextEntryActivity,
    textEntryFocused,
    renderAssistSuggestions: presentation.renderAssistSuggestions,
    startBusySpinner: presentation.startBusySpinner,
    stopBusySpinner: presentation.stopBusySpinner,
    dispose: () => {
      presentation.stopBusySpinner();
      tuiActivityFeed.dispose();
      overlays.closeComposer();
      overlays.closePalette();
    },
    overlays,
  };
}
