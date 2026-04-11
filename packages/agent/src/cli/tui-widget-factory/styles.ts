import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export function panelStyle(theme: TuiThemeProfile, accent: string) {
  return {
    fg: theme.baseFg,
    bg: theme.panelBg,
    border: { fg: accent },
    label: { fg: accent, bold: true },
    scrollbar: {
      fg: accent,
      bg: theme.panelBg,
    },
  };
}
