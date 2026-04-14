import type blessed from "blessed";
import {
  renderEcosystemContent,
  renderGatewayOpsContent,
  renderJobsContent,
  renderResponsesContent,
  renderSuggestionsContent,
} from "@/cli/control-deck";
import { macAwareKeyLabel } from "@/cli/shell-chrome";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";
import { installTuiControlDeck } from "../../tui-control-deck";
import { renderFooter } from "../../tui-renderers";
import type { TuiStateStore } from "../../tui-state";
import type { TuiWidgetSet } from "../../tui-widget-factory";

interface CreateTuiStartControlDeckOptions {
  context: AppContext;
  screen: blessed.Widgets.Screen;
  widgets: TuiWidgetSet;
  tuiState: TuiStateStore;
  getActiveTheme: () => TuiThemeProfile;
  flushDeferredForeignActivity: () => void;
}

export function createTuiStartControlDeck({
  context,
  screen,
  widgets,
  tuiState,
  getActiveTheme,
  flushDeferredForeignActivity,
}: CreateTuiStartControlDeckOptions) {
  const {
    activity,
    response,
    sidebar,
    assistBox,
    footer,
    inputBox,
    paletteList,
  } = widgets;

  return installTuiControlDeck({
    screen,
    responsePane: response,
    activityPane: activity,
    sidebarPane: sidebar,
    assistBox,
    footer,
    inputBox,
    paletteList,
    getCurrentMode: () => tuiState.controlDeckMode,
    isPaletteOpen: () => tuiState.paletteOpen,
    isComposerOpen: () => tuiState.composerOpen,
    formatKeyLabel: macAwareKeyLabel,
    flushDeferredForeignActivity,
    getBusyFrames: () => getActiveTheme().busyFrames,
    buildFooterContent: (hint, busyFrame) =>
      renderFooter(
        context,
        tuiState.busy,
        tuiState.queueDepth,
        hint,
        busyFrame,
      ),
    renderAssistSuggestionsContent: (value) =>
      renderSuggestionsContent(
        context.config.workspaceDir,
        value,
        getActiveTheme(),
      ),
    renderNonAssistControlDeckContent: async (mode) => {
      if (mode === "ecosystem") {
        return await renderEcosystemContent(context);
      }
      if (mode === "gateway") {
        return await renderGatewayOpsContent(context);
      }
      if (mode === "responses") {
        return renderResponsesContent(context);
      }
      return renderJobsContent(context);
    },
  });
}
