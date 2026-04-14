import { TUI_THEME_PROFILES } from "./profiles";

export const TUI_THEMES = TUI_THEME_PROFILES;
export type TuiThemeName = keyof typeof TUI_THEMES;

export const DEFAULT_TUI_THEME: TuiThemeName = "orange";
