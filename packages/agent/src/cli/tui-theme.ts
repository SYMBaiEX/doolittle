import { buildHeaderContent } from "@/cli/cockpit-chrome";
import { panelStyle, type TuiWidgetSet } from "@/cli/tui-widget-factory";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export function applyTuiTheme(
  agentName: string,
  theme: TuiThemeProfile,
  widgets: TuiWidgetSet,
): void {
  const {
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
  } = widgets;

  header.style.fg = theme.baseFg;
  header.style.bg = theme.primary;
  header.setContent(buildHeaderContent(agentName, theme));

  activity.style = panelStyle(theme, theme.cyanGlow);
  response.style = panelStyle(theme, theme.magentaGlow);
  sidebar.style = panelStyle(theme, theme.greenGlow);
  transportBox.style = panelStyle(theme, theme.cyanGlow);
  executionBox.style = panelStyle(theme, theme.greenGlow);
  assistBox.style = panelStyle(theme, theme.amberGlow);

  paletteOverlay.style.fg = theme.baseFg;
  paletteOverlay.style.bg = theme.baseBg;
  paletteOverlay.style.border = { fg: theme.magentaGlow };
  paletteOverlay.style.label = { fg: theme.magentaGlow, bold: true };

  paletteInput.style.border = { fg: theme.amberGlow };
  paletteInput.style.label = { fg: theme.amberGlow, bold: true };
  paletteInput.style.focus = { border: { fg: theme.primary } };

  paletteList.style.border = { fg: theme.cyanGlow };
  paletteList.style.selected = {
    bg: theme.primary,
    fg: theme.baseFg,
  };
  paletteList.style.item = { fg: theme.baseFg };

  composerOverlay.style.fg = theme.baseFg;
  composerOverlay.style.bg = theme.baseBg;
  composerOverlay.style.border = { fg: theme.greenGlow };
  composerOverlay.style.label = { fg: theme.greenGlow, bold: true };

  composer.style.border = { fg: theme.greenGlow };
  composer.style.label = { fg: theme.greenGlow, bold: true };
  composer.style.focus = { border: { fg: theme.primary } };

  inputBox.style.fg = theme.baseFg;
  inputBox.style.bg = theme.baseBg;
  inputBox.style.border = { fg: theme.primary };
  inputBox.style.label = { fg: theme.primary, bold: true };
  inputBox.style.focus = { border: { fg: theme.cyanGlow } };

  footer.style.fg = theme.baseFg;
  footer.style.bg = theme.baseBg;
}
