import { TUI_THEMES, type TuiThemeName } from "./catalog";
import { normalizeTuiThemeInput } from "./normalize";
import type { TuiThemeProfile } from "./types";

export const TUI_THEME_ENTRIES = Object.entries(TUI_THEMES) as Array<
  [TuiThemeName, TuiThemeProfile]
>;

export const TUI_THEME_NAMES = TUI_THEME_ENTRIES.map(([name]) => name);

export const TUI_THEME_ALIAS_MAP = new Map<string, TuiThemeName>(
  TUI_THEME_ENTRIES.flatMap(([name, theme]) =>
    (theme.aliases ?? []).flatMap((alias) => {
      const normalized = normalizeTuiThemeInput(alias);
      return normalized ? [[normalized, name] as const] : [];
    }),
  ),
);

export function isTuiThemeName(value: string): value is TuiThemeName {
  return Object.hasOwn(TUI_THEMES, value);
}
