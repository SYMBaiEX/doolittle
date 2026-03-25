export interface TuiThemeProfile {
  name: string;
  label: string;
  tagline: string;
  aliases?: string[];
  sigil: string;
  shellGlyph: string;
  idleFace: string;
  busyFrames: string[];
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

function parseHexColor(
  value: string,
): { r: number; g: number; b: number } | null {
  const normalized = value.trim();
  if (!normalized.startsWith("#")) {
    return null;
  }
  const hex = normalized.slice(1);
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    if (!r || !g || !b) {
      return null;
    }
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

export function getReadableTextColor(
  background: string,
  light = "white",
  dark = "black",
): string {
  const parsed = parseHexColor(background);
  if (!parsed) {
    return light;
  }
  const luminance =
    (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
  return luminance > 0.62 ? dark : light;
}

export const TUI_THEMES = {
  orange: {
    name: "orange",
    label: "Neon Dune",
    tagline: "Warm ignition for the operator cockpit.",
    aliases: ["dune", "sunwire"],
    sigil: ".::",
    shellGlyph: ">>",
    idleFace: "(^_)",
    busyFrames: ["(::)", "(.:)", "(..)", "(:.)", "(<>)", "(^_)"],
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
    tagline: "Clean signal with official ElizaOS restraint.",
    aliases: ["static", "signalblue"],
    sigil: "[::]",
    shellGlyph: "::",
    idleFace: "[ok]",
    busyFrames: ["[::]", "[.:]", "[..]", "[:.]", "[ok]"],
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
    tagline: "Low-light terminal residue with a living pulse.",
    aliases: ["ghost", "terminal"],
    sigil: "<//>",
    shellGlyph: "<>",
    idleFace: "[#]",
    busyFrames: ["[#]", "[##]", "[# ]", "[ #]", "[##]"],
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
    tagline: "Soft neon geometry for long operator nights.",
    aliases: ["grid", "midnight"],
    sigil: "<*>",
    shellGlyph: "><",
    idleFace: "(*)",
    busyFrames: ["<*>", "<.:>", "<..>", "<:.>", "<*>"],
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
    label: "Crimson Forge",
    tagline: "Redline pressure with a sharper, hotter pulse.",
    aliases: ["forge", "crimson", "redline"],
    sigil: "{##}",
    shellGlyph: "!!",
    idleFace: "{ok}",
    busyFrames: ["{..}", "{:.}", "{##}", "{:.}", "{ok}"],
    baseBg: "black",
    baseFg: "white",
    primary: "#D7263D",
    secondary: "#FF6B6B",
    amberGlow: "#FFC857",
    cyanGlow: "#63E6FF",
    greenGlow: "#93FFB0",
    magentaGlow: "#FF7DE8",
    muted: "gray",
    panelBg: "black",
  },
  arctic: {
    name: "arctic",
    label: "Polar Signal",
    tagline: "Cold glass clarity for high-trust focus.",
    aliases: ["polar", "frostline"],
    sigil: "[[]]",
    shellGlyph: "[]",
    idleFace: "(°°)",
    busyFrames: ["[[]]", "[..]", "[::]", "[..]", "(°°)"],
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
    tagline: "Sharp lime voltage for aggressive work.",
    aliases: ["acid", "burn"],
    sigil: "{@@}",
    shellGlyph: "@>",
    idleFace: "(@@)",
    busyFrames: ["{@@}", "{@.}", "{..}", "{.@}", "(@@)"],
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
    tagline: "A quieter, more theatrical control surface.",
    aliases: ["velvet", "circuit"],
    sigil: "<3>",
    shellGlyph: ">>",
    idleFace: "(~)",
    busyFrames: ["<3>", "<~>", "<.>", "<~>", "(~)"],
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
    tagline: "Dark chrome for minimal interference.",
    aliases: ["null", "glass"],
    sigil: "[::]",
    shellGlyph: "::",
    idleFace: "[--]",
    busyFrames: ["[::]", "[--]", "[..]", "[--]", "[ok]"],
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
    tagline: "Bright neutral light with a soft edge.",
    aliases: ["pale", "relay"],
    sigil: "(::)",
    shellGlyph: "->",
    idleFace: "(-)",
    busyFrames: ["(::)", "(..)", "(. )", "( .)", "(-)"],
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
  tagline: string;
  aliases: string[];
  primary: string;
  secondary: string;
}> {
  return (
    Object.entries(TUI_THEMES) as Array<[TuiThemeName, TuiThemeProfile]>
  ).map(([name, theme]) => ({
    name,
    label: theme.label,
    tagline: theme.tagline,
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
