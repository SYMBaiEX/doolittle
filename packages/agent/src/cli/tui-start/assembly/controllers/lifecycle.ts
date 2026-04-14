import { createTuiLifecycleController } from "@/cli/tui-lifecycle/controller";
import type {
  TuiStartControllersOptions,
  TuiStartLifecycleController,
} from "./types";

export function installTuiStartLifecycle(
  options: TuiStartControllersOptions,
): TuiStartLifecycleController {
  const {
    context,
    state,
    screen,
    output,
    crashLogPath,
    lifecycleState,
    surfaces,
  } = options;

  return createTuiLifecycleController({
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
}
