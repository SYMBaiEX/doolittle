import { installTuiRuntimeObservers } from "@/cli/tui-runtime-observers";
import type { TuiStartControllersOptions } from "./types";

export function installTuiStartRuntimeObservers(
  options: TuiStartControllersOptions,
): () => void {
  const { context, state, tuiState, surfaces } = options;

  return installTuiRuntimeObservers({
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
}
