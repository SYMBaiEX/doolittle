import {
  parseThemeManifestV2,
  type SemanticPalette,
  type ThemeManifestV2,
} from "@doolittle/contracts/theme";

const dark: SemanticPalette = {
  background: "#0b0b0a",
  navigation: "#10100f",
  raised: "#161614",
  subtle: "#1b1a18",
  hover: "#22211e",
  border: "#282622",
  borderStrong: "#3a3630",
  text: "#f4f1eb",
  secondaryText: "#c9c3b9",
  mutedText: "#a0988f",
  accent: "#ff6b16",
  accentInk: "#1b0b02",
  accentText: "#ff9b5c",
  success: "#86b875",
  warning: "#e7a84d",
  error: "#e47763",
};
const light: SemanticPalette = {
  background: "#eeeae4",
  navigation: "#f7f4ef",
  raised: "#fdfbf8",
  subtle: "#e9e3dc",
  hover: "#e1d9d0",
  border: "#d1c8be",
  borderStrong: "#b6aa9e",
  text: "#211d19",
  secondaryText: "#564e47",
  mutedText: "#5f554d",
  accent: "#df5700",
  accentInk: "#1b0b02",
  accentText: "#8a3500",
  success: "#3f6c34",
  warning: "#755318",
  error: "#984437",
};

export const COMPANION_THEME: ThemeManifestV2 = parseThemeManifestV2({
  kind: "doolittle.theme",
  version: 2,
  id: "companion",
  name: "Companion",
  description: "Warm, quiet conversations with familiar bot contacts.",
  layout: "companion",
  colors: { light, dark },
  typography: {
    bodyFont: "avenir",
    codeFont: "monospace",
    conversationSize: 16,
    controlSize: 14,
    metadataSize: 12,
    lineHeight: 1.55,
  },
  spacing: { unit: 4, row: 8, page: 16 },
  geometry: {
    navigationWidth: 248,
    inspectorWidth: 320,
    readingWidth: 760,
    controlRadius: 8,
    composerRadius: 12,
    controlHeight: 40,
    touchHeight: 44,
    headerHeight: 48,
  },
  density: "comfortable",
  motion: { durationMs: 120, reducedMotion: "respect-system" },
});

export const CANVAS_THEME: ThemeManifestV2 = parseThemeManifestV2({
  ...COMPANION_THEME,
  id: "canvas",
  name: "Canvas",
  layout: "canvas",
  description: "A spacious working canvas with navigation available on demand.",
  colors: {
    dark: {
      ...dark,
      background: "#101416",
      navigation: "#151b1e",
      raised: "#1b2327",
      subtle: "#20292e",
      hover: "#29343a",
      border: "#303e45",
      borderStrong: "#485a63",
      text: "#edf3f3",
      secondaryText: "#c2cfd2",
      mutedText: "#9aafb5",
      accent: "#7ccfc6",
      accentInk: "#102321",
      accentText: "#91ded5",
    },
    light: {
      ...light,
      background: "#f3f6f5",
      navigation: "#eaf0ee",
      raised: "#ffffff",
      subtle: "#e1ebe7",
      hover: "#d6e3dd",
      border: "#c0d1ca",
      borderStrong: "#8fa79c",
      text: "#182d27",
      secondaryText: "#40594f",
      mutedText: "#4f685e",
      accent: "#176858",
      accentInk: "#ffffff",
      accentText: "#175e50",
    },
  },
  typography: { ...COMPANION_THEME.typography, bodyFont: "system" },
  geometry: {
    ...COMPANION_THEME.geometry,
    readingWidth: 960,
    controlRadius: 4,
    composerRadius: 8,
  },
});

export const BUILT_IN_THEMES: readonly ThemeManifestV2[] = [
  COMPANION_THEME,
  CANVAS_THEME,
];

const fonts: Record<ThemeManifestV2["typography"]["bodyFont"], string> = {
  avenir:
    '"Avenir Next", "Segoe UI Variable Text", -apple-system, BlinkMacSystemFont, sans-serif',
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, sans-serif',
  humanist: 'Optima, Candara, "Noto Sans", ui-sans-serif, sans-serif',
  monospace:
    '"SFMono-Regular", "Cascadia Code", Consolas, ui-monospace, monospace',
};

function luminance(hex: string): number {
  return [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}

export function themeContrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Accessibility is checked independently for both supported appearances. */
export function validateThemeAccessibility(theme: ThemeManifestV2): void {
  for (const palette of Object.values(theme.colors)) {
    for (const surface of [
      palette.background,
      palette.navigation,
      palette.raised,
      palette.subtle,
      palette.hover,
    ]) {
      for (const text of [
        palette.text,
        palette.secondaryText,
        palette.mutedText,
      ]) {
        if (themeContrast(text, surface) < 4.5)
          throw new Error(
            "Theme text must meet 4.5:1 contrast on every ordinary surface.",
          );
      }
      if (themeContrast(palette.accentText, surface) < 4.5)
        throw new Error("Theme accent text must meet 4.5:1 contrast.");
    }
    if (themeContrast(palette.accentInk, palette.accent) < 4.5)
      throw new Error("Theme primary controls must meet 4.5:1 contrast.");
    if (
      palette.accentHover &&
      themeContrast(palette.accentInk, palette.accentHover) < 4.5
    )
      throw new Error(
        "Theme hovered primary controls must meet 4.5:1 contrast.",
      );
  }
  for (const palette of Object.values(theme.codeColors ?? {}))
    if (themeContrast(palette.text, palette.background) < 4.5)
      throw new Error("Theme code text must meet 4.5:1 contrast.");
}

export function themeCssVariables(
  value: ThemeManifestV2,
  appearance: "dark" | "light",
  density = value.density,
): Record<string, string> {
  const theme = parseThemeManifestV2(value);
  validateThemeAccessibility(theme);
  const p = theme.colors[appearance];
  const t = theme.typography;
  const g = theme.geometry;
  const compact = density === "compact";
  const variables: Record<string, string> = {
    "--bg": p.background,
    "--surface": p.navigation,
    "--surface-raised": p.raised,
    "--surface-soft": p.subtle,
    "--surface-hover": p.hover,
    "--border": p.border,
    "--border-strong": p.borderStrong,
    "--text": p.text,
    "--text-soft": p.secondaryText,
    "--muted": p.mutedText,
    "--faint": p.mutedText,
    "--accent": p.accent,
    "--accent-ink": p.accentInk,
    "--accent-text": p.accentText,
    "--accent-hover": p.accentHover ?? p.accent,
    "--good": p.success,
    "--warn": p.warning,
    "--bad": p.error,
    "--font-sans": fonts[t.bodyFont],
    "--font-display": fonts[t.bodyFont],
    "--font-mono": fonts.monospace,
    "--text-body": `${t.conversationSize}px`,
    "--text-control": `${t.controlSize}px`,
    "--text-meta": `${compact ? Math.max(11, t.metadataSize - 1) : t.metadataSize}px`,
    "--text-caption": `${t.metadataSize}px`,
    "--line-body": String(t.lineHeight),
    "--line-control": "1.4",
    "--line-meta": "1.4",
    "--sidebar-width": `${g.navigationWidth}px`,
    "--inspector-width": `${g.inspectorWidth}px`,
    "--reading-width": `${g.readingWidth}px`,
    "--conversation-width": `${g.readingWidth}px`,
    "--control-height": `${compact ? Math.max(36, g.controlHeight - 4) : g.controlHeight}px`,
    "--touch-height": `${g.touchHeight}px`,
    "--page-header-min-height": `${compact ? Math.max(40, g.headerHeight - 8) : g.headerHeight}px`,
    "--radius-md": `${g.controlRadius}px`,
    "--radius-lg": `${g.composerRadius}px`,
    "--radius-xl": `${g.composerRadius}px`,
    "--page-gap": `${compact ? Math.max(8, theme.spacing.page - 4) : theme.spacing.page}px`,
    "--card-pad": `${compact ? Math.max(8, theme.spacing.page - 4) : theme.spacing.page}px`,
    "--row-pad": `${compact ? Math.max(6, theme.spacing.row - 2) : theme.spacing.row}px`,
    "--motion-duration": `${theme.motion.durationMs}ms`,
    "--focus-ring": p.accentText,
    "--canvas-bg": theme.codeColors?.[appearance].background ?? p.background,
    "--canvas-text": theme.codeColors?.[appearance].text ?? p.text,
    "--canvas-text-soft": p.secondaryText,
    "--canvas-border": p.borderStrong,
  };
  const terminal = theme.terminalColors;
  for (const [token, value] of Object.entries({
    "--terminal-blue": terminal?.blue ?? p.accent,
    "--terminal-bright-blue": terminal?.brightBlue ?? p.accent,
    "--terminal-cyan": terminal?.cyan ?? p.accentText,
    "--terminal-bright-cyan": terminal?.cyan ?? p.accentText,
    "--terminal-magenta": terminal?.magenta ?? p.accentText,
    "--terminal-bright-magenta": terminal?.magenta ?? p.accentText,
    "--theme-cyan": terminal?.cyan ?? p.accentText,
    "--theme-magenta": terminal?.magenta ?? p.accentText,
    "--theme-muted": terminal?.muted ?? p.mutedText,
  }))
    variables[token] = value;
  for (const [name, color] of [
    ["accent", p.accent],
    ["good", p.success],
    ["warn", p.warning],
    ["bad", p.error],
  ]) {
    variables[`--${name}-soft`] =
      `color-mix(in srgb, ${color} 14%, ${p.navigation})`;
  }
  for (let n = 1; n <= 5; n++)
    variables[`--space-${n}`] =
      `${theme.spacing.unit * [1, 2, 3, 4, 6][n - 1]}px`;
  return variables;
}

const legacyNames: Record<string, string> = {
  black: "#080706",
  blue: "#4f7cff",
  cyan: "#63e6ff",
  gray: "#a0988f",
  green: "#86b875",
  magenta: "#ff7de8",
  orange: "#ff7a00",
  red: "#e47763",
  white: "#f4f1eb",
  yellow: "#e7a84d",
};

/** Convert the old opaque, non-executable CSS color subset to canonical hex. */
export function legacyThemeColor(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 240) return undefined;
  const text = value.trim().toLowerCase();
  if (legacyNames[text]) return legacyNames[text];
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/u.exec(
    text,
  )?.[1];
  if (hex) {
    const expanded =
      hex.length <= 4 ? [...hex].map((c) => c.repeat(2)).join("") : hex;
    return expanded.length === 8 && expanded.slice(6) !== "ff"
      ? undefined
      : `#${expanded.slice(0, 6)}`;
  }
  const match = /^(rgb|rgba|hsl|hsla)\(([\d\s.,%deg+-]+)\)$/u.exec(text);
  if (!match) return undefined;
  const parts = match[2].split(",").map((part) => part.trim());
  if (parts.length !== (match[1].endsWith("a") ? 4 : 3)) return undefined;
  const scalar = (part: string, unit: string) => {
    if (
      !new RegExp(`^[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)${unit}$`, "u").test(part)
    )
      return Number.NaN;
    return Number.parseFloat(part);
  };
  const alpha =
    parts[3] === undefined
      ? 1
      : scalar(parts[3], "%?") / (parts[3].endsWith("%") ? 100 : 1);
  if (alpha !== 1) return undefined;
  let channels: number[];
  if (match[1].startsWith("rgb")) {
    channels = parts
      .slice(0, 3)
      .map((part) => scalar(part, "%?") * (part.endsWith("%") ? 2.55 : 1));
  } else {
    const hue = scalar(parts[0], "(?:deg)?");
    const saturation = scalar(parts[1], "%") / 100;
    const lightness = scalar(parts[2], "%") / 100;
    if (
      !Number.isFinite(hue) ||
      saturation < 0 ||
      saturation > 1 ||
      lightness < 0 ||
      lightness > 1
    )
      return undefined;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = (((hue % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    const rgb =
      segment < 1
        ? [chroma, x, 0]
        : segment < 2
          ? [x, chroma, 0]
          : segment < 3
            ? [0, chroma, x]
            : segment < 4
              ? [0, x, chroma]
              : segment < 5
                ? [x, 0, chroma]
                : [chroma, 0, x];
    channels = rgb.map((n) => (n + lightness - chroma / 2) * 255);
  }
  if (channels.some((n) => !Number.isFinite(n) || n < 0 || n > 255))
    return undefined;
  return `#${channels.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
}

export interface LegacyThemeBundle {
  kind: "doolittle.theme";
  version: 1;
  theme: Record<string, unknown>;
  appearance: "light" | "dark" | "system";
  density: "compact" | "comfortable";
}

/** Pure migration; callers retain the original storage bytes before replacing. */
export function migrateLegacyThemeBundle(
  bundle: LegacyThemeBundle,
): import("@doolittle/contracts/theme").ThemeBundleV2 {
  if (bundle.kind !== "doolittle.theme" || bundle.version !== 1)
    throw new Error("Unsupported legacy theme.");
  const profile = bundle.theme;
  const primary = legacyThemeColor(profile.primary);
  if (
    !primary ||
    typeof profile.name !== "string" ||
    typeof profile.label !== "string"
  )
    throw new Error("Invalid legacy theme profile.");
  const colors = structuredClone(COMPANION_THEME.colors);
  const secondary = legacyThemeColor(profile.secondary) ?? primary;
  for (const palette of Object.values(colors)) {
    palette.accent = primary;
    palette.accentInk =
      themeContrast("#160b03", primary) >= 4.5 ? "#160b03" : "#fffaf5";
    if (themeContrast(palette.accentInk, secondary) >= 4.5)
      palette.accentHover = secondary;
    const surfaces = [
      palette.background,
      palette.navigation,
      palette.raised,
      palette.subtle,
      palette.hover,
    ];
    const readable = (candidate: string | undefined) =>
      candidate &&
      surfaces.every((surface) => themeContrast(candidate, surface) >= 4.5);
    if (readable(primary)) palette.accentText = primary;
    const success = legacyThemeColor(profile.greenGlow);
    const warning = legacyThemeColor(profile.amberGlow);
    if (readable(success) && success) palette.success = success;
    if (readable(warning) && warning) palette.warning = warning;
  }
  const theme = parseThemeManifestV2({
    ...COMPANION_THEME,
    id: profile.name.toLowerCase(),
    name: profile.label,
    description:
      typeof profile.tagline === "string"
        ? profile.tagline
        : "Imported color theme",
    colors,
    codeColors: {
      light: { background: light.raised, text: light.text },
      dark: {
        background:
          legacyThemeColor(profile.panelBg) ??
          legacyThemeColor(profile.baseBg) ??
          "#080706",
        text: legacyThemeColor(profile.baseFg) ?? dark.text,
      },
    },
    terminalColors: {
      blue: primary,
      brightBlue: secondary,
      cyan: legacyThemeColor(profile.cyanGlow) ?? secondary,
      magenta: legacyThemeColor(profile.magentaGlow) ?? secondary,
      ...(legacyThemeColor(profile.muted)
        ? { muted: legacyThemeColor(profile.muted) }
        : {}),
    },
    density: bundle.density,
  });
  validateThemeAccessibility(theme);
  return {
    kind: "doolittle.theme.bundle",
    version: 2,
    theme,
    appearance: bundle.appearance,
    density: bundle.density,
  };
}
