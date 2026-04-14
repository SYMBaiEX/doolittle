import { installTuiScreenEvents } from "@/cli/tui-screen-events";
import type { TuiStartControllersOptions } from "./types";

export function installTuiStartScreenEvents(
  options: TuiStartControllersOptions,
): void {
  const { screen, widgets, surfaces } = options;

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
}
