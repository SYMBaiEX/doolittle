import { createTuiActivityFeed } from "../../tui-activity-feed";
import { createTuiTranscriptController } from "../../tui-transcript/controller";
import type { TuiStartAssemblyState } from "../assembly-state";
import { createTuiStartFatalLogger } from "../boot/fatal-logger";
import type { TuiStartSetupOptions } from "./types";

interface TuiStartRuntimeSurfacesOptions {
  options: TuiStartSetupOptions;
  assemblyState: TuiStartAssemblyState;
  textEntryFocused: () => boolean;
}

export function createTuiStartRuntimeSurfaces({
  options,
  assemblyState,
  textEntryFocused,
}: TuiStartRuntimeSurfacesOptions) {
  const {
    context,
    state,
    logger,
    output,
    crashLogPath,
    transcriptExportPath,
    widgets,
    tuiState,
    truncate,
    canCopyToClipboard,
  } = options;
  const { activity, response } = widgets;

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

  const transcript = createTuiTranscriptController({
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
    pushResponseEntry: transcript.pushResponseEntry,
    truncate,
  });

  return {
    tuiActivityFeed,
    appendActivity,
    flushDeferredForeignActivity,
    pushNotice,
    routeForeignActivity,
    scheduleDeferredForeignRefresh,
    transcript,
    logFatal,
  };
}
