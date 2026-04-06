import type blessed from "blessed";
import { type CliState, executeCliInput } from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { TuiCommandQueueState } from "@/cli/tui-command-queue";
import { installTuiCommandQueue } from "@/cli/tui-command-queue";
import { installTuiInputBindings } from "@/cli/tui-input-bindings";
import {
  installTuiLifecycle,
  type TuiLifecycleState,
} from "@/cli/tui-lifecycle";
import { installTuiRuntimeObservers } from "@/cli/tui-runtime-observers";
import { installTuiScreenBindings } from "@/cli/tui-screen-bindings";
import { installTuiScreenEvents } from "@/cli/tui-screen-events";
import type { TuiStateStore } from "@/cli/tui-state";
import type { TuiWidgetSet } from "@/cli/tui-widget-factory";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiStartSetupResult } from "../setup";

export interface TuiStartControllersOptions {
  context: AppContext;
  state: CliState;
  logger: AppLogger;
  screen: blessed.Widgets.Screen;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  tuiState: TuiStateStore;
  lifecycleState: TuiLifecycleState;
  queueState: TuiCommandQueueState;
  widgets: TuiWidgetSet;
  focusables: blessed.Widgets.BlessedElement[];
  surfaces: TuiStartSetupResult;
  tuiInputLifecycle: {
    resetInputAfterQueue: () => void;
    restoreInputAfterRun: () => Promise<void>;
    handleEmptyQueueSubmit: () => void;
  };
  isConversationalInput: (text: string) => boolean;
}

export interface TuiStartControllersResult {
  dispose: () => void;
}

export function installTuiStartControllers(
  options: TuiStartControllersOptions,
): TuiStartControllersResult {
  const {
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
    surfaces,
    tuiInputLifecycle,
    isConversationalInput,
  } = options;
  const {
    inputBox,
    activity,
    response,
    sidebar,
    assistBox,
    paletteInput,
    paletteList,
  } = widgets;

  let tuiLifecycle!: ReturnType<typeof installTuiLifecycle>;

  const tuiCommandQueue = installTuiCommandQueue({
    context,
    state,
    logger: logger.child("queue"),
    queueState,
    executeInput: executeCliInput,
    isConversationalInput,
    appendActivity: surfaces.appendActivity,
    getLiveResponse: () => surfaces.getLiveResponse() as never,
    setLiveResponse: (
      label: string,
      body: string,
      options?: {
        kind?: ResponseTranscriptEntry["kind"];
        pending?: boolean;
      },
    ) => {
      surfaces.setLiveResponse(label, body, options);
    },
    pushResponseEntry: surfaces.pushResponseEntry,
    pushNotice: surfaces.pushNotice,
    scheduleRefreshPanels: surfaces.scheduleRefreshPanels,
    syncThemeFromSettings: surfaces.syncThemeFromSettings,
    startBusySpinner: surfaces.startBusySpinner,
    stopBusySpinner: surfaces.stopBusySpinner,
    focusProcessingSurface: surfaces.focusProcessingSurface,
    refreshPanels: () => surfaces.refreshPanels(),
    flushDeferredForeignActivity: surfaces.flushDeferredForeignActivity,
    resetInputAfterQueue: () => tuiInputLifecycle.resetInputAfterQueue(),
    restoreInputAfterRun: () => tuiInputLifecycle.restoreInputAfterRun(),
    handleEmptyQueueSubmit: () => tuiInputLifecycle.handleEmptyQueueSubmit(),
    onRecoveryFailure: (error: unknown) => {
      surfaces.logFatal("renderFailure", error);
      if (!tuiState.screenDestroyed) {
        screen.destroy();
      }
      output.write(
        `\nDoolittle TUI could not recover. Crash log: ${crashLogPath}\n`,
      );
      process.exit(1);
    },
    destroyScreen: () => {
      screen.destroy();
    },
    requestExit: (exitCode?: number) => {
      tuiLifecycle.exitCli(exitCode);
    },
  });

  surfaces.assemblyState.setQueueCommand((line: string) => {
    tuiCommandQueue.queueCommand(line);
  });

  installTuiInputBindings({
    inputBox: inputBox,
    workspaceDir: context.config.workspaceDir,
    hasLiveTextEntryCompletion: (entry: unknown) =>
      surfaces.hasLiveTextEntryCompletion(entry as never),
    queueCommand: (line: string) => {
      surfaces.assemblyState.queueCommand(line);
    },
    hasHistory: () => tuiCommandQueue.hasHistory(),
    historyBack: () => tuiCommandQueue.historyBack(),
    historyForward: () => tuiCommandQueue.historyForward(),
    noteTextEntryActivity: surfaces.noteTextEntryActivity,
    getControlDeckMode: () => tuiState.controlDeckMode,
    renderAssistSuggestions: (value: string) => {
      surfaces.renderAssistSuggestions(value);
    },
    updateFooterHint: () => {
      surfaces.updateFooterHint();
    },
    screenRender: () => {
      screen.render();
    },
  });

  tuiLifecycle = installTuiLifecycle({
    context,
    state,
    screen,
    output,
    crashLogPath,
    lifecycleState,
    logFatal: surfaces.logFatal,
    stopBusySpinner: surfaces.stopBusySpinner,
    appendActivity: surfaces.appendActivity,
    pushNotice: surfaces.pushNotice,
    pushResponseEntry: surfaces.pushResponseEntry,
    scheduleRefreshPanels: surfaces.scheduleRefreshPanels,
    clearLiveResponse: surfaces.clearLiveResponse,
  });

  installTuiScreenBindings({
    screen,
    inputBox: inputBox,
    response: response,
    activity: activity,
    sidebar: sidebar,
    assistBox: assistBox,
    paletteInput,
    paletteList,
    focusables,
    getFocusIndex: () => tuiState.focusIndex,
    setFocusIndex: (value: number) => {
      tuiState.focusIndex = value;
    },
    activateTextEntry: (entry: unknown) => {
      surfaces.activateTextEntry(entry as never);
    },
    deactivateTextEntry: (entry: unknown) => {
      surfaces.deactivateTextEntry(entry as never);
    },
    textEntryFocused: () => surfaces.textEntryFocused(),
    isPaletteOpen: () => tuiState.paletteOpen,
    isComposerOpen: () => tuiState.composerOpen,
    getControlDeckMode: () => tuiState.controlDeckMode,
    setControlDeckMode: (
      mode: "assist" | "gateway" | "jobs" | "ecosystem" | "responses",
    ) => {
      tuiState.controlDeckMode = mode;
    },
    refreshPanels: surfaces.refreshPanels,
    updateFooterHint: () => {
      surfaces.updateFooterHint();
    },
    queueCommand: surfaces.assemblyState.queueCommand,
    workspaceDir: context.config.workspaceDir,
    lifecycle: {
      exitCli: () => {
        tuiLifecycle.exitCli();
      },
      handleSigint: () => {
        tuiLifecycle.handleSigint();
      },
    },
    overlays: surfaces.overlays,
    clearActivity: () => {
      widgets.activity.setContent("");
    },
    resetResponses: surfaces.resetResponses,
    exportTranscript: surfaces.exportTranscript,
    toggleOpsCollapsed: () => {
      tuiState.opsCollapsed = !tuiState.opsCollapsed;
      surfaces.syncLayout();
      surfaces.updateFooterHint();
    },
  });

  installTuiScreenEvents({
    screen,
    minCols: 80,
    minRows: 24,
    appendActivity: surfaces.appendActivity,
    syncLayout: surfaces.syncLayout,
    scheduleRefreshPanels: surfaces.scheduleRefreshPanels,
    noteWarningFooterHint: () => {
      surfaces.setFooterHint("Check warning in activity", {
        render: false,
      });
    },
    refreshPanels: surfaces.refreshPanels,
    focusTrackedElements: [
      widgets.activity,
      widgets.response,
      widgets.sidebar,
      widgets.assistBox,
      widgets.paletteInput,
      widgets.paletteList,
      widgets.composer,
      widgets.inputBox,
    ],
    textEntryElements: [
      widgets.inputBox,
      widgets.composer,
      widgets.paletteInput,
    ],
    noteTextEntryActivity: surfaces.noteTextEntryActivity,
    updateFooterHint: () => {
      surfaces.updateFooterHint();
    },
  });

  const disposeObservers = installTuiRuntimeObservers({
    context,
    state,
    isBusy: () => tuiState.busy,
    appendActivity: surfaces.appendActivity,
    pushNotice: surfaces.pushNotice,
    pushLiveToolEvent: surfaces.pushLiveToolEvent,
    getLiveResponse: () => surfaces.getLiveResponse(),
    refreshLiveResponse: surfaces.refreshLiveResponse,
    scheduleRefreshPanels: surfaces.scheduleRefreshPanels,
  });

  return {
    dispose: () => {
      tuiLifecycle.dispose();
      disposeObservers();
    },
  };
}
