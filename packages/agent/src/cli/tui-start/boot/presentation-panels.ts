import type blessed from "blessed";
import {
  renderExecutionContent,
  renderTransportContent,
} from "@/cli/control-deck";
import type { CliExecutionResult, CliState } from "@/cli/execution";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiControlDeckController } from "../../tui-control-deck/types";
import { installTuiPanels } from "../../tui-panels";
import { renderStatusContent } from "../../tui-renderers";
import type { TuiWidgetSet } from "../../tui-widget-factory";

interface CreateTuiStartPanelsOptions {
  context: AppContext;
  state: CliState;
  screen: blessed.Widgets.Screen;
  widgets: TuiWidgetSet;
  logger: AppLogger;
  controlDeck: TuiControlDeckController;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  truncate: (text: string, maxLength: number) => string;
}

export function createTuiStartPanels({
  context,
  state,
  screen,
  widgets,
  logger,
  controlDeck,
  appendActivity,
  truncate,
}: CreateTuiStartPanelsOptions) {
  const { sidebar, transportBox, executionBox, assistBox, footer } = widgets;

  return installTuiPanels({
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
}
