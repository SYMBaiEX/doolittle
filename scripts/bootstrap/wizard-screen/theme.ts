import {
  DEFAULT_TUI_THEME,
  getReadableTextColor,
  getTuiTheme,
  type TuiThemeName,
} from "@doolittle/agent/runtime/theme-catalog";
import { getThemeByName, type WizardChromeTheme } from "./render";
import type { WizardScreenWidgets } from "./widgets";

export interface WizardSelectionStyle {
  bg: string;
  fg: string;
}

/**
 * Contrast-safe foreground/background pair for a selected list row. The row
 * is painted with the theme primary, which spans near-black to near-white
 * across the catalog, so the foreground must derive through the WCAG ladder
 * exactly like the header surface instead of hardcoding black or white. The
 * CLI cockpit applies the same derivation through contrastSelectionStyle in
 * apps/cli; both sides share the getReadableTextColor primitive from
 * @doolittle/agent because scripts cannot import app code.
 */
export function wizardSelectionStyle(
  theme: WizardChromeTheme,
): WizardSelectionStyle {
  return {
    bg: theme.primary,
    fg: getReadableTextColor(theme.primary, theme.baseFg, "black"),
  };
}

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
