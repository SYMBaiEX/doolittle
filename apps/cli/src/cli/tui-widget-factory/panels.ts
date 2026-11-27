import { terminalGlyph } from "../terminal-glyphs";
import type { TuiWidgetFactoryContext } from "./context";
import { panelStyle } from "./styles";
import type { TuiWidgetSet } from "./types";

type TuiPanelWidgets = Pick<
  TuiWidgetSet,
  "activity" | "response" | "sidebar" | "assistBox"
>;

type PanelAccentToken = "magentaGlow" | "greenGlow" | "cyanGlow" | "amberGlow";

interface BoxPanelLayout {
  top: string | number;
  left: string | number;
  width: string | number;
  height: string | number;
  label: string;
  accent: PanelAccentToken;
  content?: string;
}

const BOX_PANEL_LAYOUTS: Record<
  Exclude<keyof TuiPanelWidgets, "activity">,
  BoxPanelLayout
> = {
  response: {
    top: 3,
    left: 0,
    width: "82%",
    height: "64%-1",
    label: " Conversation ",
    accent: "magentaGlow",
    content:
      "{gray-fg}Conversation, streamed replies, and active tool activity appear here.{/}",
  },
  sidebar: {
    top: 3,
    left: "82%",
    width: "18%",
    height: "30%",
    label: " Status ",
    accent: "greenGlow",
  },
  assistBox: {
    top: "52%+3",
    left: "82%",
    width: "18%",
    height: "18%-1",
    label: " Controls ",
    accent: "amberGlow",
  },
};

function createScrollableBox(
  { ui, screen, theme }: TuiWidgetFactoryContext,
  layout: BoxPanelLayout,
): TuiWidgetSet["response"] {
  return ui.box({
    parent: screen,
    top: layout.top,
    left: layout.left,
    width: layout.width,
    height: layout.height,
    label: layout.label,
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    scrollbar: {
      // Blessed draws exactly one thumb cell in overflow; a blank glyph makes
      // it invisible. A single-column block in the panel accent stays quiet
      // while remaining visible against the panel background.
      ch: terminalGlyph("█", "#"),
    },
    style: panelStyle(theme, theme[layout.accent]),
    content: layout.content,
  });
}

function createActivityPanel({
  ui,
  screen,
  theme,
}: TuiWidgetFactoryContext): TuiWidgetSet["activity"] {
  return ui.log({
    parent: screen,
    top: "64%+2",
    left: 0,
    width: "82%",
    height: "28%-2",
    label: " Activity ",
    tags: true,
    border: "line",
    scrollback: 1000,
    wrap: true,
    keys: true,
    mouse: false,
    vi: true,
    scrollbar: {
      ch: terminalGlyph("█", "#"),
    },
    style: panelStyle(theme, theme.cyanGlow),
  });
}

function createBoxPanel(
  context: TuiWidgetFactoryContext,
  layout: BoxPanelLayout,
): TuiWidgetSet["response"] {
  return createScrollableBox(context, layout);
}

export function createPanelWidgets(
  context: TuiWidgetFactoryContext,
): TuiPanelWidgets {
  return {
    activity: createActivityPanel(context),
    response: createBoxPanel(context, BOX_PANEL_LAYOUTS.response),
    sidebar: createBoxPanel(context, BOX_PANEL_LAYOUTS.sidebar),
    assistBox: createBoxPanel(context, BOX_PANEL_LAYOUTS.assistBox),
  };
}
