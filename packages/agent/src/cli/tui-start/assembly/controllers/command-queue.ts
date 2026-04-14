import { executeCliInput } from "@/cli/execution";
import { installTuiCommandQueue } from "@/cli/tui-command-queue";
import type {
  TuiStartCommandQueueController,
  TuiStartControllersOptions,
} from "./types";

export function installTuiStartCommandQueue(
  options: TuiStartControllersOptions,
  requestExit: (exitCode?: number) => void,
): TuiStartCommandQueueController {
  const {
    context,
    state,
    logger,
    screen,
    output,
    crashLogPath,
    queueState,
    surfaces,
    tuiInputLifecycle,
    isConversationalInput,
  } = options;

  return installTuiCommandQueue({
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
      responseOptions?: {
        kind?: import("@/cli/transcript-renderer").ResponseTranscriptEntry["kind"];
        pending?: boolean;
      },
    ) => {
      surfaces.setLiveResponse(label, body, responseOptions);
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
      requestExit(1);
      output.write(
        `\nDoolittle TUI could not recover. Crash log: ${crashLogPath}\n`,
      );
    },
    destroyScreen: () => {
      screen.destroy();
    },
    requestExit,
  });
}
