export interface TuiThemeProfile {
  name: string;
  label: string;
  aliases?: string[];
  baseBg: string;
  baseFg: string;
  primary: string;
  secondary: string;
  amberGlow: string;
  cyanGlow: string;
  greenGlow: string;
  magentaGlow: string;
  muted: string;
  panelBg: string;
}

export const TUI_THEMES = {
  orange: {
    name: "orange",
    label: "Neon Dune",
    aliases: ["dune", "sunwire"],
    baseBg: "black",
    baseFg: "white",
    primary: "#FF6A00",
    secondary: "#FFB000",
    amberGlow: "#FFB000",
    cyanGlow: "cyan",
    greenGlow: "green",
    magentaGlow: "magenta",
    muted: "gray",
    panelBg: "black",
  },
  blue: {
    name: "blue",
    label: "Blue Static",
    aliases: ["static", "signalblue"],
    baseBg: "black",
    baseFg: "white",
    primary: "#0B35F1",
    secondary: "cyan",
    amberGlow: "yellow",
    cyanGlow: "cyan",
    greenGlow: "green",
    magentaGlow: "magenta",
    muted: "gray",
    panelBg: "black",
  },
  matrix: {
    name: "matrix",
    label: "Ghostline",
    aliases: ["ghost", "terminal"],
    baseBg: "black",
    baseFg: "green",
    primary: "#00FF66",
    secondary: "#7DFFB3",
    amberGlow: "#C4FF00",
    cyanGlow: "#00FFD5",
    greenGlow: "#00FF66",
    magentaGlow: "#FF4FD8",
    muted: "gray",
    panelBg: "black",
  },
  synthwave: {
    name: "synthwave",
    label: "Midnight Grid",
    aliases: ["grid", "midnight"],
    baseBg: "black",
    baseFg: "white",
    primary: "#FF4FD8",
    secondary: "#8A63FF",
    amberGlow: "#FFB347",
    cyanGlow: "#30D5FF",
    greenGlow: "#8BFF9F",
    magentaGlow: "#FF4FD8",
    muted: "gray",
    panelBg: "black",
  },
  ember: {
    name: "ember",
    label: "Furnace Hex",
    aliases: ["forge", "hex"],
    baseBg: "black",
    baseFg: "white",
    primary: "#FF4D2D",
    secondary: "#FF8A3D",
    amberGlow: "#FFC04D",
    cyanGlow: "#5EEBFF",
    greenGlow: "#7BFF91",
    magentaGlow: "#FF6BCB",
    muted: "gray",
    panelBg: "black",
  },
  arctic: {
    name: "arctic",
    label: "Polar Signal",
    aliases: ["polar", "frostline"],
    baseBg: "black",
    baseFg: "white",
    primary: "#7DEBFF",
    secondary: "#B7F7FF",
    amberGlow: "#FFE38A",
    cyanGlow: "#7DEBFF",
    greenGlow: "#A6FFCC",
    magentaGlow: "#E39BFF",
    muted: "gray",
    panelBg: "black",
  },
  toxic: {
    name: "toxic",
    label: "Acid Burn",
    aliases: ["acid", "burn"],
    baseBg: "black",
    baseFg: "white",
    primary: "#B8FF00",
    secondary: "#F0FF66",
    amberGlow: "#FFD24D",
    cyanGlow: "#40FFF2",
    greenGlow: "#B8FF00",
    magentaGlow: "#FF43C6",
    muted: "gray",
    panelBg: "black",
  },
  rose: {
    name: "rose",
    label: "Velvet Circuit",
    aliases: ["velvet", "circuit"],
    baseBg: "black",
    baseFg: "white",
    primary: "#FF5C93",
    secondary: "#FF9FBE",
    amberGlow: "#FFD166",
    cyanGlow: "#63E6FF",
    greenGlow: "#7FFFA7",
    magentaGlow: "#FF5C93",
    muted: "gray",
    panelBg: "black",
  },
  obsidian: {
    name: "obsidian",
    label: "Null Glass",
    aliases: ["null", "glass"],
    baseBg: "black",
    baseFg: "white",
    primary: "#8D99AE",
    secondary: "#C9D6EA",
    amberGlow: "#E7C76B",
    cyanGlow: "#7EE0FF",
    greenGlow: "#8CFFB5",
    magentaGlow: "#D78EFF",
    muted: "gray",
    panelBg: "black",
  },
  ivory: {
    name: "ivory",
    label: "Pale Relay",
    aliases: ["pale", "relay"],
    baseBg: "#101010",
    baseFg: "#F7F7F7",
    primary: "#F2F2F2",
    secondary: "#D7D7D7",
    amberGlow: "#FFD166",
    cyanGlow: "#76E4F7",
    greenGlow: "#8DF5A6",
    magentaGlow: "#FF91E8",
    muted: "gray",
    panelBg: "#101010",
  },
} as const satisfies Record<string, TuiThemeProfile>;

export type TuiThemeName = keyof typeof TUI_THEMES;

export const DEFAULT_TUI_THEME: TuiThemeName = "orange";

export function listTuiThemes(): Array<{
  name: TuiThemeName;
  label: string;
  aliases: string[];
  primary: string;
  secondary: string;
}> {
  return (
    Object.entries(TUI_THEMES) as Array<[TuiThemeName, TuiThemeProfile]>
  ).map(([name, theme]) => ({
    name,
    label: theme.label,
    aliases: theme.aliases ?? [],
    primary: theme.primary,
    secondary: theme.secondary,
  }));
}

export function resolveTuiThemeName(value?: string): TuiThemeName | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized in TUI_THEMES) {
    return normalized as TuiThemeName;
  }
  const match = (
    Object.entries(TUI_THEMES) as Array<[TuiThemeName, TuiThemeProfile]>
  ).find(([, theme]) => theme.aliases?.includes(normalized));
  return match?.[0];
}

export function getTuiTheme(theme?: string): TuiThemeProfile {
  const resolved = resolveTuiThemeName(theme) ?? DEFAULT_TUI_THEME;
  return TUI_THEMES[resolved];
}

export function nextTuiTheme(theme?: string): TuiThemeName {
  const names = Object.keys(TUI_THEMES) as TuiThemeName[];
  const current = resolveTuiThemeName(theme) ?? DEFAULT_TUI_THEME;
  const index = names.indexOf(current);
  return names[(index + 1) % names.length] ?? DEFAULT_TUI_THEME;
}

export function previousTuiTheme(theme?: string): TuiThemeName {
  const names = Object.keys(TUI_THEMES) as TuiThemeName[];
  const current = resolveTuiThemeName(theme) ?? DEFAULT_TUI_THEME;
  const index = names.indexOf(current);
  return names[(index - 1 + names.length) % names.length] ?? DEFAULT_TUI_THEME;
}
