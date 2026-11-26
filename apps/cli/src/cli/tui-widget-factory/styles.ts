import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";

export function panelStyle(theme: TuiThemeProfile, accent: string) {
  return {
    fg: theme.baseFg,
    bg: theme.panelBg,
    border: { fg: accent },
    label: { fg: accent, bold: true },
    scrollbar: {
      // The thumb glyph (see panels.ts) is a foreground block, so it renders
      // accent-on-panel-background: visible in overflow without adding a
      // full-height track, which keeps the chrome quiet.
      fg: accent,
      bg: theme.panelBg,
    },
  };
}
