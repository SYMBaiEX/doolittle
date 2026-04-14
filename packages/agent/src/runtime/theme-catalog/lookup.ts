import { DEFAULT_TUI_THEME, TUI_THEMES, type TuiThemeName } from "./catalog";
import { normalizeTuiThemeInput } from "./normalize";
import {
  isTuiThemeName,
  TUI_THEME_ALIAS_MAP,
  TUI_THEME_ENTRIES,
  TUI_THEME_NAMES,
} from "./registry";
import type { TuiThemeProfile, TuiThemeSummary } from "./types";

export function listTuiThemes(): TuiThemeSummary<TuiThemeName>[] {
  return TUI_THEME_ENTRIES.map(([name, theme]) => ({
    name,
    label: theme.label,
    tagline: theme.tagline,
    aliases: theme.aliases ?? [],
    primary: theme.primary,
    secondary: theme.secondary,
  }));
}

export function resolveTuiThemeName(value?: string): TuiThemeName | undefined {
  const normalized = normalizeTuiThemeInput(value);
  if (!normalized) {
    return undefined;
  }

  if (isTuiThemeName(normalized)) {
    return normalized;
  }

  return TUI_THEME_ALIAS_MAP.get(normalized);
}

export function getTuiTheme(theme?: string): TuiThemeProfile {
  const resolved = resolveTuiThemeName(theme) ?? DEFAULT_TUI_THEME;
  return TUI_THEMES[resolved];
}

function moveTheme(theme: string | undefined, offset: number): TuiThemeName {
  const current = resolveTuiThemeName(theme) ?? DEFAULT_TUI_THEME;
  const index = TUI_THEME_NAMES.indexOf(current);
  return (
    TUI_THEME_NAMES[
      (index + offset + TUI_THEME_NAMES.length) % TUI_THEME_NAMES.length
    ] ?? DEFAULT_TUI_THEME
  );
}

export function nextTuiTheme(theme?: string): TuiThemeName {
  return moveTheme(theme, 1);
}

export function previousTuiTheme(theme?: string): TuiThemeName {
  return moveTheme(theme, -1);
}
