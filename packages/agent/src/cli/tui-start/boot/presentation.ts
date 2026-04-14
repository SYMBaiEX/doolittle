import type blessed from "blessed";
import {
  renderExecutionContent,
  renderTransportContent,
} from "@/cli/control-deck";
import type { CliState } from "@/cli/execution";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import { getTuiTheme, type TuiThemeProfile } from "@/runtime/theme-catalog";
import { applyTuiLayout } from "../../tui-layout";
import type { TuiStateStore } from "../../tui-state";
import { applyTuiTheme } from "../../tui-theme";
import type { TuiWidgetSet } from "../../tui-widget-factory";
import type { TuiStartAssemblyHintOptions } from "../assembly-state";
import { createTuiStartControlDeck } from "./presentation-control-deck";
import { createTuiStartPanels } from "./presentation-panels";

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
  const { activity } = widgets;

  const controlDeck = createTuiStartControlDeck({
    context,
    screen,
    widgets,
    tuiState,
    getActiveTheme,
    flushDeferredForeignActivity,
  });

  const panels = createTuiStartPanels({
    context,
    state,
    screen,
    widgets,
    logger,
    controlDeck,
    appendActivity,
    truncate,
  });

  const refreshPanels = () => panels.refreshPanels();
  const scheduleRefreshPanels = (delayMs = 120) => {
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
