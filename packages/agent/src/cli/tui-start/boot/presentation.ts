import type blessed from "blessed";
import {
  renderEcosystemContent,
  renderExecutionContent,
  renderGatewayOpsContent,
  renderJobsContent,
  renderResponsesContent,
  renderSuggestionsContent,
  renderTransportContent,
} from "@/cli/control-deck";
import type { CliState } from "@/cli/execution";
import { macAwareKeyLabel } from "@/cli/shell-chrome";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import { getTuiTheme, type TuiThemeProfile } from "@/runtime/theme-catalog";
import { installTuiControlDeck } from "../../tui-control-deck";
import { applyTuiLayout } from "../../tui-layout";
import { installTuiPanels } from "../../tui-panels";
import { renderFooter, renderStatusContent } from "../../tui-renderers";
import type { TuiStateStore } from "../../tui-state";
import { applyTuiTheme } from "../../tui-theme";
import type { TuiWidgetSet } from "../../tui-widget-factory";
import type { TuiStartAssemblyHintOptions } from "../assembly-state";

export interface TuiStartPresentationOptions {
  context: AppContext;
  state: CliState;
  screen: blessed.Widgets.Screen;
  widgets: TuiWidgetSet;
  tuiState: TuiStateStore;
  logger: AppLogger;
  getActiveTheme: () => TuiThemeProfile;
  setActiveTheme: (theme: TuiThemeProfile) => void;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
  flushDeferredForeignActivity: () => void;
  truncate: (text: string, maxLength: number) => string;
}

export interface TuiStartPresentationResult {
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
  renderAssistSuggestions: (value: string) => void;
  startBusySpinner: () => void;
  stopBusySpinner: () => void;
}

export function createTuiStartPresentation(
  options: TuiStartPresentationOptions,
): TuiStartPresentationResult {
  const {
    context,
    state,
    screen,
    widgets,
    tuiState,
    logger,
    getActiveTheme,
    setActiveTheme,
    appendActivity,
    flushDeferredForeignActivity,
    truncate,
  } = options;
  const {
    activity,
    response,
    sidebar,
    transportBox,
    executionBox,
    assistBox,
    paletteList,
    inputBox,
    footer,
  } = widgets;

  let refreshPanels: () => Promise<void> = async () => {};
  let scheduleRefreshPanels = (_delayMs = 120): void => {};

  const controlDeck = installTuiControlDeck({
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

  const panels = installTuiPanels({
    logger: logger.child("panels"),
    screen,
    sidebar,
    transportBox,
    executionBox,
    assistBox,
    footer,
    renderStatusRail: () => renderStatusContent(context, state),
    renderTransportPanel: async () => renderTransportContent(context),
    renderExecutionPanel: async () => renderExecutionContent(context),
    renderControlDeck: () => controlDeck.renderCurrentControlDeck(),
    renderFooterContent: () => controlDeck.renderFooterContent(),
    appendActivity: (kind, message, tone) => {
      appendActivity(kind, truncate(message, 180), tone);
    },
  });

  refreshPanels = () => panels.refreshPanels();
  scheduleRefreshPanels = (delayMs = 120) => {
    panels.scheduleRefreshPanels(delayMs);
  };

  const syncThemeFromSettings = async (): Promise<void> => {
    const nextTheme = getTuiTheme(context.services.settings.get().ui.theme);
    if (nextTheme.name === getActiveTheme().name) {
      return;
    }
    setActiveTheme(nextTheme);
    applyTuiTheme(context.config.agentName, nextTheme, widgets);
    appendActivity(
      "theme",
      `Operator theme switched to ${nextTheme.name}.`,
      "success",
    );
    await refreshPanels();
  };

  const syncLayout = (): void => {
    applyTuiLayout(screen, widgets, {
      opsCollapsed: tuiState.opsCollapsed,
    });
    activity.setLabel(
      tuiState.opsCollapsed ? " Ops Stream " : " Ops Stream · Expanded ",
    );
    screen.render();
  };

  return {
    renderCurrentControlDeck: () => controlDeck.renderCurrentControlDeck(),
    renderTransportPanel: async () => renderTransportContent(context),
    renderExecutionPanel: async () => renderExecutionContent(context),
    renderFooterContent: () => controlDeck.renderFooterContent(),
    setFooterHint: (hint, options) => {
      controlDeck.setFooterHint(hint, options);
    },
    refreshPanels,
    scheduleRefreshPanels,
    updateFooterHint: (options) => {
      controlDeck.updateFooterHint(options);
    },
    syncLayout,
    applyTheme: () => {
      applyTuiTheme(context.config.agentName, getActiveTheme(), widgets);
    },
    syncThemeFromSettings,
    renderAssistSuggestions: (value) => {
      controlDeck.renderAssistSuggestions(value);
    },
    startBusySpinner: () => {
      controlDeck.startBusySpinner();
    },
    stopBusySpinner: () => {
      controlDeck.stopBusySpinner();
    },
  };
}
