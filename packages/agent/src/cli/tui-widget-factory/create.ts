import blessed from "blessed";
import { buildHeaderContent } from "@/cli/cockpit-chrome";
import { panelStyle } from "./styles";
import type { TuiWidgetFactoryOptions, TuiWidgetSet } from "./types";

export function createTuiWidgets(
  options: TuiWidgetFactoryOptions,
): TuiWidgetSet {
  const { screen, theme, agentName, ui = blessed } = options;
  const header = ui.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: theme.baseFg,
      bg: theme.primary,
    },
    content: buildHeaderContent(agentName, theme),
  });

  const activity = ui.log({
    parent: screen,
    top: "64%+2",
    left: 0,
    width: "82%",
    height: "28%-2",
    label: " Ops Stream ",
    tags: true,
    border: "line",
    scrollback: 1000,
    wrap: true,
    keys: true,
    mouse: false,
    vi: true,
    scrollbar: {
      ch: " ",
    },
    style: panelStyle(theme, theme.cyanGlow),
  });

  const response = ui.box({
    parent: screen,
    top: 3,
    left: 0,
    width: "82%",
    height: "64%-1",
    label: " Dialogue ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    keys: true,
    mouse: false,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    scrollbar: {
      ch: " ",
    },
    style: panelStyle(theme, theme.magentaGlow),
    content:
      "{gray-fg}Dialogue, streamed replies, and active tool motion will render here.{/}",
  });

  const sidebar = ui.box({
    parent: screen,
    top: 3,
    left: "82%",
    width: "18%",
    height: "30%",
    label: " Signal Rail ",
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
    style: panelStyle(theme, theme.greenGlow),
  });

  const transportBox = ui.box({
    parent: screen,
    top: 0,
    left: "82%",
    width: "18%",
    height: "0%",
    label: " Transport Mesh ",
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
    style: panelStyle(theme, theme.cyanGlow),
    hidden: true,
  });

  const executionBox = ui.box({
    parent: screen,
    top: 0,
    left: "82%",
    width: "18%",
    height: "0%",
    label: " Execution Deck ",
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
    style: panelStyle(theme, theme.greenGlow),
    hidden: true,
  });

  const assistBox = ui.box({
    parent: screen,
    top: "52%+3",
    left: "82%",
    width: "18%",
    height: "18%-1",
    label: " Control Deck ",
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
    style: panelStyle(theme, theme.amberGlow),
  });

  const paletteOverlay = ui.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "72%",
    height: "68%",
    hidden: true,
    tags: true,
    border: "line",
    label: " Command Deck ",
    style: {
      fg: theme.baseFg,
      bg: theme.baseBg,
      border: { fg: theme.magentaGlow },
      label: { fg: theme.magentaGlow, bold: true },
    },
  });

  const paletteInput = ui.textbox({
    parent: paletteOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    inputOnFocus: false,
    border: "line",
    label: " Search ",
    style: {
      border: { fg: theme.amberGlow },
      label: { fg: theme.amberGlow, bold: true },
      focus: {
        border: { fg: theme.primary },
      },
    },
  });

  const paletteList = ui.list({
    parent: paletteOverlay,
    top: 3,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    border: "line",
    label: " Matches ",
    keys: true,
    mouse: false,
    vi: true,
    tags: true,
    style: {
      border: { fg: theme.cyanGlow },
      selected: {
        bg: theme.primary,
        fg: theme.baseFg,
      },
      item: {
        fg: theme.baseFg,
      },
    },
    items: [],
  });

  const composerOverlay = ui.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "78%",
    height: "72%",
    hidden: true,
    tags: true,
    border: "line",
    label: " Longform Composer ",
    style: {
      fg: theme.baseFg,
      bg: theme.baseBg,
      border: { fg: theme.greenGlow },
      label: { fg: theme.greenGlow, bold: true },
    },
  });

  const composer = ui.textarea({
    parent: composerOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    inputOnFocus: false,
    keys: true,
    mouse: false,
    vi: true,
    border: "line",
    label: " Compose (Ctrl-S submit, Esc close) ",
    style: {
      border: { fg: theme.greenGlow },
      label: { fg: theme.greenGlow, bold: true },
      focus: {
        border: { fg: theme.primary },
      },
    },
  });

  ui.box({
    parent: composerOverlay,
    bottom: 0,
    left: 1,
    width: "100%-4",
    height: 1,
    tags: true,
    content:
      "{gray-fg}Use this for long prompts, multiline shell commands, and batched research requests.{/}",
  });

  const inputBox = ui.textbox({
    parent: screen,
    bottom: 1,
    left: 0,
    width: "100%",
    height: 3,
    label: " Transmit / Command ",
    inputOnFocus: false,
    border: "line",
    mouse: false,
    keys: true,
    tags: false,
    style: {
      fg: theme.baseFg,
      bg: theme.baseBg,
      border: { fg: theme.primary },
      label: { fg: theme.primary, bold: true },
      focus: {
        border: { fg: theme.cyanGlow },
      },
    },
  });

  const footer = ui.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: theme.baseFg,
      bg: theme.baseBg,
    },
  });

  return {
    header,
    activity,
    response,
    sidebar,
    transportBox,
    executionBox,
    assistBox,
    paletteOverlay,
    paletteInput,
    paletteList,
    composerOverlay,
    composer,
    inputBox,
    footer,
  };
}
