import {
  getReadableTextColor,
  getTuiTheme,
  type TuiThemeName,
} from "../../../packages/agent/src/runtime/theme-catalog";
import {
  WIZARD_MIN_COLS,
  WIZARD_MIN_ROWS,
  WIZARD_SECTION_ORDER,
} from "./state";
import type { WizardSnapshot } from "./types";

export interface WizardChromeTheme {
  label: string;
  tagline: string;
  primary: string;
  secondary: string;
  baseFg: string;
  baseBg: string;
  panelBg: string;
  cyanGlow: string;
  greenGlow: string;
}

export interface WizardRenderModel {
  headerContent: string;
  sidebarContent: string;
  detailContent: string;
  logContent: string;
  tooSmall: boolean;
  selectedTextColor: string;
}

export function buildWizardRenderModel(
  snapshot: WizardSnapshot,
  theme: WizardChromeTheme,
  viewport: { cols: number; rows: number },
): WizardRenderModel {
  const tooSmall =
    viewport.cols < WIZARD_MIN_COLS || viewport.rows < WIZARD_MIN_ROWS;
  const selectedTextColor = getReadableTextColor(
    theme.secondary,
    theme.baseFg,
    "black",
  );

  return {
    headerContent:
      `${snapshot.title}\n${snapshot.subtitle}\n` +
      `Theme: ${theme.label} · ${theme.tagline}`,
    sidebarContent: WIZARD_SECTION_ORDER.map((name) =>
      name === snapshot.currentSection ? `› ${name}` : `  ${name}`,
    ).join("\n"),
    detailContent: tooSmall
      ? `Terminal Too Small\nResize to at least ${WIZARD_MIN_COLS}×${WIZARD_MIN_ROWS} for the fullscreen ritual. Press Ctrl-C to exit or resize to continue.`
      : `${snapshot.currentSection}\n${snapshot.currentDetail}`,
    logContent: tooSmall
      ? snapshot.logLines
          .slice(-8)
          .concat([
            `WARNING: fullscreen ritual needs ${WIZARD_MIN_COLS}×${WIZARD_MIN_ROWS}; current terminal is ${viewport.cols}×${viewport.rows}.`,
          ])
          .join("\n")
      : snapshot.logLines.join("\n"),
    tooSmall,
    selectedTextColor,
  };
}

export function buildWizardThemeFooter(
  theme: WizardChromeTheme,
  formatKeyLabel: (label: string) => string,
): string {
  return ` ↑/↓ move  Enter confirm  Space toggle  Esc keep current  Theme preview ${theme.label}  Highlight ${getReadableTextColor(theme.secondary, theme.baseFg, "black") === "black" ? "dark" : "light"} text  ${formatKeyLabel("Ctrl-T/Y")} cycle `;
}

export function buildWizardBaseFooter(
  formatKeyLabel: (label: string) => string,
): string {
  return ` ↑/↓ move  Enter confirm  Space toggle  Esc keep current  ${formatKeyLabel("Ctrl-T")} next theme  ${formatKeyLabel("Ctrl-Y")} previous theme  ${formatKeyLabel("Ctrl-C")} exit `;
}

export function buildWizardFooterHint(
  label: string,
  formatKeyLabel: (label: string) => string,
): string {
  return ` ${label}  |  ${formatKeyLabel("Ctrl-C")} exits `;
}

export function getThemeByName(themeName: TuiThemeName): WizardChromeTheme {
  return getTuiTheme(themeName) as WizardChromeTheme;
}
