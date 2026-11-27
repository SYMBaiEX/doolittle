import {
  getReadableTextColor,
  getTuiTheme,
  type TuiThemeName,
} from "@doolittle/agent/runtime/theme-catalog";
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
  magentaGlow: string;
  muted: string;
}

export interface WizardSelectionStyle {
  bg: string;
  fg: string;
}

/**
 * Contrast-safe foreground/background pair for a selected row. The row is
 * painted with the theme primary, which spans near-black to near-white
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

export interface WizardRenderModel {
  headerContent: string;
  sidebarContent: string;
  detailContent: string;
  logContent: string;
  tooSmall: boolean;
  selectionStyle: WizardSelectionStyle;
}

export function buildWizardRenderModel(
  snapshot: WizardSnapshot,
  theme: WizardChromeTheme,
  viewport: { cols: number; rows: number },
): WizardRenderModel {
  const tooSmall =
    viewport.cols < WIZARD_MIN_COLS || viewport.rows < WIZARD_MIN_ROWS;
  // The current-section row is a filled selection pill on the theme primary,
  // the same surface list selections use, so its foreground derives through
  // the same contrast ladder. Deriving against theme.secondary instead would
  // measure the wrong surface: secondary is never painted behind this text,
  // and several catalog secondaries are light enough that the derived
  // foreground came out black on the black panel — an invisible current
  // section in the default theme.
  const selectionStyle = wizardSelectionStyle(theme);

  return {
    headerContent:
      `${snapshot.title}\n${snapshot.subtitle}\n` +
      `Theme: ${theme.label} · ${theme.tagline}`,
    sidebarContent: WIZARD_SECTION_ORDER.map((name) =>
      name === snapshot.currentSection
        ? `{bold}{${selectionStyle.bg}-bg}{${selectionStyle.fg}-fg}› ${name}{/}{/}{/bold}`
        : `  ${name}`,
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
    selectionStyle,
  };
}

export function buildWizardBaseFooter(
  formatKeyLabel: (label: string) => string,
): string {
  return ` ↑/↓ move  Enter confirm  Space toggle  Esc keep current  ${formatKeyLabel("Ctrl-C")} exit `;
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
