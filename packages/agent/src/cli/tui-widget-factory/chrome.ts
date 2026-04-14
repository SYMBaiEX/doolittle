import { buildHeaderContent } from "@/cli/cockpit-chrome";
import type {
  TuiWidgetAssemblyContext,
  TuiWidgetFactoryContext,
} from "./context";
import type { TuiWidgetSet } from "./types";

type TuiChromeWidgets = Pick<TuiWidgetSet, "header" | "inputBox" | "footer">;

function createHeader({
  ui,
  screen,
  theme,
  agentName,
}: TuiWidgetAssemblyContext): TuiWidgetSet["header"] {
  return ui.box({
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
}

function createInputBox({
  ui,
  screen,
  theme,
}: TuiWidgetFactoryContext): TuiWidgetSet["inputBox"] {
  return ui.textbox({
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
}

function createFooter({
  ui,
  screen,
  theme,
}: TuiWidgetFactoryContext): TuiWidgetSet["footer"] {
  return ui.box({
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
}

export function createChromeWidgets(
  context: TuiWidgetAssemblyContext,
): TuiChromeWidgets {
  return {
    header: createHeader(context),
    inputBox: createInputBox(context),
    footer: createFooter(context),
  };
}
