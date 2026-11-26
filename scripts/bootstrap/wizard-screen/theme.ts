import {
  DEFAULT_TUI_THEME,
  getReadableTextColor,
  getTuiTheme,
  type TuiThemeName,
} from "@doolittle/agent/runtime/theme-catalog";
import { getThemeByName } from "./render";
import type { WizardScreenWidgets } from "./widgets";

export function applyWizardTheme(
  widgets: WizardScreenWidgets,
  themeName: TuiThemeName,
): void {
  const theme = getTuiTheme(themeName);
  const primaryFg = getReadableTextColor(theme.primary, theme.baseFg, "black");
  widgets.header.style.fg = primaryFg;
  widgets.header.style.bg = theme.primary;
  widgets.sidebar.style.border = { fg: theme.primary };
  widgets.sidebar.style.fg = theme.baseFg;
  widgets.sidebar.style.bg = theme.panelBg;
  widgets.detail.style.border = { fg: theme.cyanGlow };
  widgets.detail.style.fg = theme.baseFg;
  widgets.detail.style.bg = theme.panelBg;
  widgets.logBox.style.border = { fg: theme.greenGlow };
  widgets.logBox.style.fg = theme.baseFg;
  widgets.logBox.style.bg = theme.panelBg;
  widgets.logBox.style.scrollbar = {
    fg: theme.cyanGlow,
    bg: theme.panelBg,
  };
  widgets.footer.style.fg = theme.cyanGlow;
  widgets.footer.style.bg = theme.baseBg;
}

export function createThemePreviewRenderer(
  widgets: WizardScreenWidgets,
): (themeName: TuiThemeName) => void {
  return (themeName) => {
    applyWizardTheme(widgets, themeName);
  };
}

export { DEFAULT_TUI_THEME, getThemeByName };
