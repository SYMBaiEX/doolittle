import {
  parseThemeManifestV2,
  type SemanticPalette,
  type ThemeManifestV2,
} from "@doolittle/contracts/theme";
import {
  composeThemeManifest,
  splitThemeSelection,
  type ThemeColorOverlay,
} from "@doolittle/ui/theme-colors";
import {
  BUILT_IN_THEMES,
  COMPANION_THEME,
  legacyThemeColor,
  migrateLegacyThemeBundle,
  themeContrast,
  themeCssVariables,
  validateThemeAccessibility,
} from "@doolittle/ui/themes";

export type DesktopAppearance = "dark" | "light" | "system";
export type DesktopDensity = "compact" | "comfortable";

export interface DesktopThemeProfile {
  name: string;
  label: string;
  tagline: string;
  primary: string;
  secondary: string;
  amberGlow: string;
  greenGlow: string;
  cyanGlow?: string;
  magentaGlow?: string;
  muted?: string;
  baseBg?: string;
  baseFg?: string;
  panelBg?: string;
}

export const APPEARANCE_STORAGE_KEY = "doolittle.desktop.appearance";
export const DENSITY_STORAGE_KEY = "doolittle.desktop.density";
export const THEME_STORAGE_KEY = "doolittle.desktop.theme";
export const THEME_V2_STORAGE_KEY = "doolittle.desktop.theme.v2";
export const THEME_V1_BACKUP_STORAGE_KEY = "doolittle.desktop.theme.v1-backup";
export const UI_LAYOUT_STORAGE_KEY = "doolittle.desktop.layout";
export const THEME_SOURCE_STORAGE_KEY = "doolittle.desktop.theme-source";
export const THEME_SELECTION_STORAGE_KEY = "doolittle.desktop.theme-selection";
export const APPEARANCE_CHANGE_EVENT = "doolittle:appearance-change";
export const APPEARANCE_APPLIED_EVENT = "doolittle:appearance-applied";
export const DENSITY_CHANGE_EVENT = "doolittle:density-change";
export const THEME_CHANGE_EVENT = "doolittle:theme-change";
export const THEME_MANIFEST_CHANGE_EVENT = "doolittle:theme-manifest-change";

let themeMigrationError = "";

const cssVariable = (name: string): string => `var(--${name})`;

const BASE_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--font-display":
    '"Avenir Next", "Segoe UI Variable Display", "Segoe UI", ui-sans-serif, sans-serif',
  "--font-sans":
    '"Avenir Next", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif',
  "--font-mono":
    '"SFMono-Regular", "Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", ui-monospace, monospace',
  "--radius-xs": "3px",
  "--radius-sm": "5px",
  "--radius-md": "8px",
  "--radius-lg": "10px",
  "--radius-xl": "12px",
  "--text-meta": "12px",
  "--text-control": "14px",
  "--text-caption": "12px",
  "--text-body": "14px",
  "--text-conversation": "16px",
  "--text-code": "13px",
  "--line-meta": "17px",
  "--line-control": "18px",
  "--line-body": "21px",
  "--line-title": "1.2",
  "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "--motion-duration": "120ms",
  "--sidebar-width": "248px",
  "--inspector-width": "320px",
  "--conversation-width": "760px",
  "--sidebar-compact-width": "68px",
  "--page-gap": "12px",
  "--page-header-min-height": "48px",
  "--page-title-size": "clamp(19px, 1.35vw, 22px)",
  "--chat-welcome-title-size": "clamp(22px, 2vw, 28px)",
  "--card-pad": "12px",
  "--row-pad": "8px",
  "--control-height": "40px",
  "--touch-height": "44px",
  "--page-readable-meta": "12px",
  "--space-hairline": "2px",
  "--space-tight": "6px",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--operator-line": "color-mix(in srgb, var(--accent) 36%, var(--border))",
  "--focus-ring": "var(--accent-text)",
  "--control-contact": "none",
  "--surface-selected": "transparent",
  "--line-subtle": "var(--border)",
  // Compatibility aliases used by the imported Eliza primitives and retained
  // renderer surfaces. Keep these mapped to Doolittle's canonical palette.
  "--accent-contrast": cssVariable("accent-ink"),
  "--accent-muted": cssVariable("accent"),
  "--accent-subtle": cssVariable("accent-soft"),
  "--border-hover": cssVariable("accent"),
  "--border-subtle": "var(--line-subtle)",
  "--line-strong": "var(--border-strong)",
  "--text-muted": "var(--muted)",
  "--text-section": "var(--text)",
  "--text-sm": "var(--text-body)",
  "--success": "var(--good)",
  "--warning": "var(--warn)",
  "--info": cssVariable("text-soft"),
  "--sidebar": cssVariable("surface"),
  "--sidebar-foreground": cssVariable("text"),
  "--sidebar-primary": cssVariable("accent"),
  "--sidebar-primary-foreground": cssVariable("accent-ink"),
  "--sidebar-accent": cssVariable("surface-soft"),
  "--sidebar-accent-foreground": cssVariable("text"),
  "--sidebar-border": cssVariable("border"),
  "--sidebar-ring": cssVariable("accent"),
  "--chart-1": cssVariable("accent"),
  "--chart-2": cssVariable("good"),
  "--chart-3": cssVariable("warn"),
  "--chart-4": cssVariable("bad"),
  "--chart-5": cssVariable("text-soft"),
  // Canvas defaults are replaced by profiles that provide editor colors.
  "--canvas-bg": "#080706",
  "--canvas-text": "#f4f1eb",
  "--canvas-text-soft": "#c9c3b9",
  "--canvas-border": "#3a3630",
  "--shell-shadow-md":
    "0 10px 28px color-mix(in srgb, var(--shadow) 12%, transparent)",
  "--shell-shadow-lg":
    "0 18px 48px color-mix(in srgb, var(--shadow) 18%, transparent)",
  "--background": cssVariable("bg"),
  "--foreground": cssVariable("text"),
  "--card": cssVariable("surface-raised"),
  "--card-foreground": cssVariable("text"),
  "--popover": cssVariable("surface-raised"),
  "--popover-foreground": cssVariable("text"),
  "--bg-accent": cssVariable("surface-soft"),
  "--bg-elevated": cssVariable("surface-raised"),
  "--bg-hover": cssVariable("surface-hover"),
  "--bg-muted": cssVariable("surface-soft"),
  "--text-strong": cssVariable("text"),
  "--chat-text": cssVariable("text"),
  "--txt": cssVariable("text"),
  "--primary": cssVariable("accent"),
  "--primary-foreground": cssVariable("accent-ink"),
  "--secondary": cssVariable("surface-soft"),
  "--secondary-foreground": cssVariable("text"),
  "--muted-foreground": cssVariable("muted"),
  "--muted-strong": cssVariable("text-soft"),
  "--accent-foreground": cssVariable("accent-ink"),
  "--destructive": cssVariable("bad"),
  "--destructive-foreground": cssVariable("text"),
  "--destructive-subtle": cssVariable("bad-soft"),
  "--danger": cssVariable("bad"),
  "--input": cssVariable("surface-raised"),
  "--ring": cssVariable("accent"),
  "--radius": cssVariable("radius-sm"),
  "--ok": cssVariable("good"),
  "--ok-muted": "color-mix(in srgb, var(--good) 72%, transparent)",
  "--ok-subtle": cssVariable("good-soft"),
  "--warn-muted": "color-mix(in srgb, var(--warn) 72%, transparent)",
  "--warn-subtle": cssVariable("warn-soft"),
  "--status-success": cssVariable("good"),
  "--status-success-bg": cssVariable("good-soft"),
  "--status-danger": cssVariable("bad"),
  "--status-danger-bg": cssVariable("bad-soft"),
  "--status-warning": cssVariable("warn"),
  "--status-warning-bg": cssVariable("warn-soft"),
  "--status-info": cssVariable("text-soft"),
  "--status-info-bg": cssVariable("surface-soft"),
  "--mono": cssVariable("font-mono"),
  "--font-body": cssVariable("font-sans"),
  "--font-heading": cssVariable("font-display"),
  "--font-chat": cssVariable("font-sans"),
};

const DARK_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--bg": "#0b0b0a",
  "--surface": "#10100f",
  "--surface-raised": "#161614",
  "--surface-soft": "#1b1a18",
  "--surface-hover": "#22211e",
  "--border": "#282622",
  "--border-strong": "#3a3630",
  "--text": "#f4f1eb",
  "--text-soft": "#c9c3b9",
  "--muted": "#a0988f",
  "--faint": "#958e85",
  "--accent": "#ff6b16",
  "--accent-ink": "#1b0b02",
  "--accent-text": "#ff9b5c",
  "--accent-hover": "#ff833f",
  "--accent-soft": "#26170d",
  "--accent-border": "#653715",
  "--good": "#86b875",
  "--good-soft": "#182417",
  "--warn": "#e7a84d",
  "--warn-soft": "#2c210f",
  "--bad": "#e47763",
  "--bad-soft": "#2e1713",
  "--destructive-foreground": "#1b0b02",
  "--shadow": "rgba(0, 0, 0, 0.4)",
};

const LIGHT_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--bg": "#eeeae4",
  "--surface": "#f7f4ef",
  "--surface-raised": "#fdfbf8",
  "--surface-soft": "#e9e3dc",
  "--surface-hover": "#e1d9d0",
  "--border": "#d1c8be",
  "--border-strong": "#b6aa9e",
  "--text": "#211d19",
  "--text-soft": "#564e47",
  "--muted": "#5f554d",
  "--faint": "#635950",
  "--accent": "#df5700",
  "--accent-ink": "#1b0b02",
  "--accent-text": "#8a3500",
  "--accent-hover": "#d55300",
  "--accent-soft": "#f5dfce",
  "--accent-border": "#d48b57",
  "--good": "#3f6c34",
  "--good-soft": "#dfeada",
  "--warn": "#755318",
  "--warn-soft": "#efe5ce",
  "--bad": "#984437",
  "--bad-soft": "#f0dad5",
  "--destructive-foreground": "#fdfbf8",
  "--shadow": "rgba(75, 58, 43, 0.12)",
};

const COMPACT_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--text-meta": "11px",
  "--text-control": "14px",
  "--text-caption": "11px",
  "--text-body": "14px",
  "--line-meta": "16px",
  "--line-control": "16px",
  "--line-body": "21px",
  "--page-gap": "8px",
  "--page-header-min-height": "40px",
  "--page-title-size": "clamp(18px, 1.2vw, 20px)",
  "--chat-welcome-title-size": "clamp(20px, 1.7vw, 24px)",
  "--card-pad": "10px",
  "--row-pad": "6px",
  "--control-height": "36px",
};

const COMFORTABLE_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--text-meta": "12px",
  "--text-control": "14px",
  "--text-caption": "12px",
  "--text-body": "14px",
  "--line-meta": "17px",
  "--line-control": "18px",
  "--line-body": "21px",
  "--page-gap": "12px",
  "--page-header-min-height": "48px",
  "--page-title-size": "clamp(19px, 1.35vw, 22px)",
  "--chat-welcome-title-size": "clamp(22px, 2vw, 28px)",
  "--card-pad": "12px",
  "--row-pad": "8px",
  "--control-height": "40px",
};

function setCssTokens(tokens: Readonly<Record<string, string>>): void {
  const style = document.documentElement.style;
  for (const [property, value] of Object.entries(tokens)) {
    style.setProperty(property, value);
  }
}

export function applyDesktopFoundationTokens(): void {
  const root = document.documentElement;
  setCssTokens(BASE_DESKTOP_TOKENS);
  root.style.fontFamily = "var(--font-sans)";
  root.style.fontSynthesis = "none";
  root.style.textRendering = "optimizeLegibility";
}

/**
 * Theme and color picks rewrite dozens of root tokens in one pass. While
 * THEME_TRANSITION_ATTRIBUTE is set on the root, theme-materials.css eases
 * paint properties to their new values instead of every surface snapping.
 * Each surface's first apply seeds the palette before the UI mounts, so it
 * stays instant; later applies transition.
 */
export const THEME_TRANSITION_ATTRIBUTE = "data-theme-transition";
const THEME_TRANSITION_WINDOW_MS = 320;
const appliedThemeSurfaces = new Set<"appearance" | "density" | "theme">();
let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

function themeTransitionsAllowed(): boolean {
  if (typeof window.matchMedia !== "function") return true;
  return !(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(forced-colors: active)").matches
  );
}

function beginThemeTransition(
  surface: "appearance" | "density" | "theme",
): void {
  const applied = appliedThemeSurfaces.has(surface);
  appliedThemeSurfaces.add(surface);
  if (!applied || !themeTransitionsAllowed()) return;
  const root = document.documentElement;
  root.dataset.themeTransition = "";
  if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
  themeTransitionTimer = setTimeout(() => {
    themeTransitionTimer = null;
    delete root.dataset.themeTransition;
  }, THEME_TRANSITION_WINDOW_MS);
}

const CSS_COLOR =
  /^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
const THEME_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const TERMINAL_COLOR_ALIASES: Readonly<Record<string, string>> = {
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

function stringValue(value: unknown, maxLength = 240): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeColor(value: unknown, fallback: string): string {
  const candidate = stringValue(value);
  if (!candidate || !CSS_COLOR.test(candidate)) return fallback;
  if (/^[a-z]+$/iu.test(candidate)) {
    return TERMINAL_COLOR_ALIASES[candidate.toLowerCase()] ?? fallback;
  }
  return candidate;
}

function optionalColor(value: unknown): string | undefined {
  const candidate = safeColor(value, "");
  return candidate || undefined;
}

type RgbColor = Readonly<{ red: number; green: number; blue: number }>;

function opaqueRgbColor(value: string): RgbColor | null {
  const hex = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu)?.[1];
  if (hex) {
    const expanded =
      hex.length <= 4
        ? [...hex].map((channel) => channel.repeat(2)).join("")
        : hex;
    if (expanded.length === 8 && expanded.slice(6).toLowerCase() !== "ff") {
      return null;
    }
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }
  const parts = value.match(/^rgba?\((.*)\)$/iu)?.[1]?.split(",");
  const alphaIsOpaque = (alpha: string | undefined): boolean => {
    if (!alpha) return true;
    const trimmed = alpha.trim();
    const raw = Number.parseFloat(trimmed);
    const resolved = trimmed.endsWith("%") ? raw / 100 : raw;
    return Number.isFinite(resolved) && resolved === 1;
  };
  const channel = (part: string): number | null => {
    const trimmed = part.trim();
    const raw = Number.parseFloat(trimmed);
    if (!Number.isFinite(raw)) return null;
    const resolved = trimmed.endsWith("%") ? (raw / 100) * 255 : raw;
    return resolved >= 0 && resolved <= 255 ? resolved : null;
  };
  if (parts && parts.length >= 3 && parts.length <= 4) {
    const [red, green, blue] = parts.slice(0, 3).map(channel);
    if (
      red === null ||
      green === null ||
      blue === null ||
      !alphaIsOpaque(parts[3])
    ) {
      return null;
    }
    return { red, green, blue };
  }
  const hsl = value.match(/^hsla?\((.*)\)$/iu)?.[1]?.split(",");
  if (!hsl || hsl.length < 3 || hsl.length > 4 || !alphaIsOpaque(hsl[3])) {
    return null;
  }
  const hue = Number.parseFloat(hsl[0]);
  const saturation = Number.parseFloat(hsl[1]);
  const lightness = Number.parseFloat(hsl[2]);
  if (
    !Number.isFinite(hue) ||
    !hsl[1].trim().endsWith("%") ||
    !hsl[2].trim().endsWith("%") ||
    saturation < 0 ||
    saturation > 100 ||
    lightness < 0 ||
    lightness > 100
  ) {
    return null;
  }
  const chroma = (1 - Math.abs(2 * (lightness / 100) - 1)) * (saturation / 100);
  const hueSegment = (((hue % 360) + 360) % 360) / 60;
  const intermediate = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const [red, green, blue] =
    hueSegment < 1
      ? [chroma, intermediate, 0]
      : hueSegment < 2
        ? [intermediate, chroma, 0]
        : hueSegment < 3
          ? [0, chroma, intermediate]
          : hueSegment < 4
            ? [0, intermediate, chroma]
            : hueSegment < 5
              ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate];
  const match = lightness / 100 - chroma / 2;
  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  };
}

function opaqueColorOrFallback(candidate: string, fallback: string): string {
  return opaqueRgbColor(candidate) ? candidate : fallback;
}

function contrastRatio(foreground: RgbColor, background: RgbColor): number {
  const luminance = ({ red, green, blue }: RgbColor): number =>
    [red, green, blue]
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (total, channel, index) =>
          total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
        0,
      );
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function mixRgb(
  foreground: RgbColor,
  background: RgbColor,
  amount: number,
): RgbColor {
  return {
    red: foreground.red * amount + background.red * (1 - amount),
    green: foreground.green * amount + background.green * (1 - amount),
    blue: foreground.blue * amount + background.blue * (1 - amount),
  };
}

function accessibleSemanticColor(
  candidate: string,
  fallback: string,
  surface: string,
): string {
  const surfaceRgb = opaqueRgbColor(surface);
  const candidateRgb = opaqueRgbColor(candidate);
  if (
    surfaceRgb &&
    candidateRgb &&
    contrastRatio(candidateRgb, mixRgb(candidateRgb, surfaceRgb, 0.14)) >= 4.5
  ) {
    return candidate;
  }
  return fallback;
}

function accentInkFor(accent: string): string | null {
  const accentRgb = opaqueRgbColor(accent);
  const darkInk = opaqueRgbColor("#160b03");
  const lightInk = opaqueRgbColor("#fffaf5");
  if (!accentRgb || !darkInk || !lightInk) return null;
  if (contrastRatio(darkInk, accentRgb) >= 4.5) return "#160b03";
  if (contrastRatio(lightInk, accentRgb) >= 4.5) return "#fffaf5";
  return null;
}

export function parseDesktopThemeProfile(
  value: unknown,
): DesktopThemeProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  const name = stringValue(profile.name, 64).toLowerCase();
  const label = stringValue(profile.label, 80);
  const primary = safeColor(profile.primary, "");
  if (!THEME_NAME.test(name) || !label || !primary) return null;
  const parsed: DesktopThemeProfile = {
    name,
    label,
    tagline: stringValue(profile.tagline, 240),
    primary,
    secondary: safeColor(profile.secondary, primary),
    amberGlow: safeColor(profile.amberGlow, primary),
    greenGlow: safeColor(profile.greenGlow, "#86b875"),
  };
  const optional = {
    cyanGlow: optionalColor(profile.cyanGlow),
    magentaGlow: optionalColor(profile.magentaGlow),
    muted: optionalColor(profile.muted),
    baseBg: optionalColor(profile.baseBg),
    baseFg: optionalColor(profile.baseFg),
    panelBg: optionalColor(profile.panelBg),
  };
  for (const [key, color] of Object.entries(optional)) {
    if (color) parsed[key as keyof typeof optional] = color;
  }
  return parsed;
}

export function themeCssTokens(
  profile: DesktopThemeProfile,
  appearance: "dark" | "light" = "dark",
): Record<string, string> {
  const appearanceTokens =
    appearance === "light" ? LIGHT_DESKTOP_TOKENS : DARK_DESKTOP_TOKENS;
  const surface = appearanceTokens["--surface"];
  const accentFallback =
    appearance === "light" ? "#8a3500" : appearanceTokens["--accent-text"];
  const goodFallback =
    appearance === "light" ? "#2d5b21" : appearanceTokens["--good"];
  const warnFallback =
    appearance === "light" ? "#5c4208" : appearanceTokens["--warn"];
  let accent = opaqueColorOrFallback(profile.primary, accentFallback);
  let accentInk = accentInkFor(accent);
  if (!accentInk) {
    accent = accentFallback;
    accentInk = accentInkFor(accent) ?? "#fffaf5";
  }
  const accentText = accessibleSemanticColor(accent, accentFallback, surface);
  const accentHover = opaqueColorOrFallback(profile.secondary, accent);
  const good = accessibleSemanticColor(
    profile.greenGlow,
    goodFallback,
    surface,
  );
  const warn = accessibleSemanticColor(
    profile.amberGlow,
    warnFallback,
    surface,
  );
  const canvasBackground =
    appearance === "light"
      ? LIGHT_DESKTOP_TOKENS["--surface-raised"]
      : (profile.panelBg ?? profile.baseBg ?? "#080706");
  const canvasText =
    appearance === "light"
      ? LIGHT_DESKTOP_TOKENS["--text"]
      : (profile.baseFg ?? "#f4f1eb");
  const cyan = profile.cyanGlow ?? profile.secondary;
  const magenta = profile.magentaGlow ?? profile.secondary;
  const tokens: Record<string, string> = {
    "--accent": accent,
    "--accent-ink": accentInk,
    "--accent-text": accentText,
    "--accent-hover": accentHover,
    "--accent-soft": `color-mix(in srgb, ${accent} 14%, var(--surface))`,
    "--accent-border": `color-mix(in srgb, ${accent} 42%, var(--border))`,
    "--good": good,
    "--good-soft": `color-mix(in srgb, ${good} 14%, var(--surface))`,
    "--warn": warn,
    "--warn-soft": `color-mix(in srgb, ${warn} 14%, var(--surface))`,
    "--theme-cyan": cyan,
    "--theme-magenta": magenta,
    "--theme-muted": profile.muted ?? "var(--muted)",
    "--terminal-blue": profile.primary,
    "--terminal-bright-blue": profile.secondary,
    "--terminal-cyan": cyan,
    "--terminal-bright-cyan": cyan,
    "--terminal-magenta": magenta,
    "--terminal-bright-magenta": magenta,
    "--canvas-bg": canvasBackground,
    "--canvas-border": `color-mix(in srgb, ${profile.primary} 28%, ${canvasBackground})`,
    "--canvas-text": canvasText,
    "--canvas-text-soft": `color-mix(in srgb, ${canvasText} 76%, ${canvasBackground})`,
  };
  return tokens;
}

/**
 * A persisted theme/color selection pair: the pristine layout manifest the
 * color composes onto plus the full runtime palette, so the composition can
 * be rebuilt offline and across built-in design updates.
 */
export interface DesktopThemeColorSelection {
  theme: ThemeManifestV2;
  color: DesktopThemeProfile;
}

export function loadThemeColorSelection(): DesktopThemeColorSelection | null {
  const stored = localStorage.getItem(THEME_SELECTION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const record = JSON.parse(stored) as Record<string, unknown>;
    const theme = parseThemeManifestV2(record?.theme);
    const color = parseDesktopThemeProfile(record?.color);
    if (!color) return null;
    return { theme, color };
  } catch {
    return null;
  }
}

function storeThemeColorSelection(
  selection: DesktopThemeColorSelection | null,
): void {
  try {
    if (selection) {
      localStorage.setItem(
        THEME_SELECTION_STORAGE_KEY,
        JSON.stringify(selection),
      );
    } else {
      localStorage.removeItem(THEME_SELECTION_STORAGE_KEY);
    }
  } catch {
    // Non-fatal: the applied manifest still reflects the selection.
  }
}

/**
 * Record or replace the two-axis selection. Imports call this with null: an
 * imported bundle is a complete design, so a previous color pick does not
 * carry onto it or onto later theme picks.
 */
export function setThemeColorSelection(
  selection: DesktopThemeColorSelection | null,
): void {
  storeThemeColorSelection(selection);
}

/**
 * The name of the color palette active on the current layout, or null when
 * the manifest carries its theme's own colors.
 */
export function getActiveColorName(): string | null {
  return (
    loadThemeColorSelection()?.color.name ??
    splitThemeSelection(loadStoredThemeManifest().id).color
  );
}

/**
 * The manifest a runtime color composes onto. The stored selection keeps the
 * pristine base so repeated color picks never tint on tinted surfaces;
 * built-ins resolve to their current preset, imported manifests keep their
 * custom surfaces, and anything else falls back to Companion — the same base
 * legacy color applications used.
 */
function colorCompositionBase(): ThemeManifestV2 {
  const record = loadThemeColorSelection();
  if (record) {
    const themeId = splitThemeSelection(record.theme.id).theme;
    return (
      BUILT_IN_THEMES.find((candidate) => candidate.id === themeId) ??
      record.theme
    );
  }
  const current = loadStoredThemeManifest();
  const { theme } = splitThemeSelection(current.id);
  const builtin = BUILT_IN_THEMES.find((candidate) => candidate.id === theme);
  if (builtin) return builtin;
  if (loadDesktopThemeSource() === "imported") return current;
  return COMPANION_THEME;
}

/**
 * Map a runtime palette onto accent, status, editor and terminal colors.
 * Accent text, success and warning are only taken when they stay readable on
 * the base manifest's own surfaces so every layout × color combination keeps
 * its contrast guarantees.
 */
function themeColorOverlay(
  profile: DesktopThemeProfile,
  base: ThemeManifestV2,
): ThemeColorOverlay {
  const pick = (palette: SemanticPalette): Partial<SemanticPalette> => {
    const primary = legacyThemeColor(profile.primary) ?? palette.accent;
    const secondary = legacyThemeColor(profile.secondary) ?? primary;
    const accentInk =
      themeContrast("#160b03", primary) >= 4.5 ? "#160b03" : "#fffaf5";
    const surfaces = [
      palette.background,
      palette.navigation,
      palette.raised,
      palette.subtle,
      palette.hover,
    ];
    const readable = (candidate: string) =>
      surfaces.every((surface) => themeContrast(candidate, surface) >= 4.5);
    const overlay: Partial<SemanticPalette> = {
      accent: primary,
      accentInk,
      // Hovered controls pair with the accent ink, not the base accent, so a
      // secondary that fails the ink check clears any inherited hover.
      accentHover:
        themeContrast(accentInk, secondary) >= 4.5 ? secondary : undefined,
    };
    if (readable(primary)) overlay.accentText = primary;
    const success = legacyThemeColor(profile.greenGlow);
    const warning = legacyThemeColor(profile.amberGlow);
    if (success && readable(success)) overlay.success = success;
    if (warning && readable(warning)) overlay.warning = warning;
    return overlay;
  };
  const primary = legacyThemeColor(profile.primary) ?? base.colors.dark.accent;
  const secondary = legacyThemeColor(profile.secondary) ?? primary;
  const muted = legacyThemeColor(profile.muted);
  return {
    name: profile.name,
    label: profile.label,
    light: pick(base.colors.light),
    dark: pick(base.colors.dark),
    codeColors: {
      dark: {
        background:
          legacyThemeColor(profile.panelBg) ??
          legacyThemeColor(profile.baseBg) ??
          base.codeColors?.dark.background ??
          "#080706",
        text:
          legacyThemeColor(profile.baseFg) ??
          base.codeColors?.dark.text ??
          base.colors.dark.text,
      },
    },
    terminalColors: {
      blue: primary,
      brightBlue: secondary,
      cyan: legacyThemeColor(profile.cyanGlow) ?? secondary,
      magenta: legacyThemeColor(profile.magentaGlow) ?? secondary,
      ...(muted ? { muted } : {}),
    },
  };
}

/**
 * Apply a runtime color palette onto the active layout theme. The palette and
 * its pristine base are persisted as the two-axis selection so the color
 * carries to whichever theme is picked next.
 */
export function applyDesktopTheme(
  profile: DesktopThemeProfile,
  source?: "imported" | "runtime",
): ThemeManifestV2 {
  // A v2 selection also broadcasts its legacy palette for Monaco/xterm
  // consumers. That notification is not a request to replace its composition.
  if (!source && localStorage.getItem(THEME_V2_STORAGE_KEY)) {
    const selected = loadStoredThemeManifest();
    const selectedColor = loadThemeColorSelection()?.color.name;
    if (selected.id === profile.name || selectedColor === profile.name) {
      return selected;
    }
  }
  const base = colorCompositionBase();
  const manifest = composeThemeManifest(base, themeColorOverlay(profile, base));
  applyThemeManifest(manifest, source);
  storeThemeColorSelection({ theme: base, color: profile });
  return manifest;
}

/**
 * Pick a layout theme, carrying the current color selection onto it. Themes
 * and colors compose into one manifest, so every layout keeps the palette
 * the user already chose.
 */
export function selectDesktopTheme(theme: ThemeManifestV2): ThemeManifestV2 {
  const color = loadThemeColorSelection()?.color ?? null;
  const manifest = color
    ? composeThemeManifest(theme, themeColorOverlay(color, theme))
    : theme;
  applyThemeManifest(manifest, color ? "runtime" : "builtin");
  if (color) storeThemeColorSelection({ theme, color });
  return manifest;
}

/** Return the active layout theme to its own colors. */
export function clearThemeColorSelection(): ThemeManifestV2 {
  const base = colorCompositionBase();
  storeThemeColorSelection(null);
  applyThemeManifest(
    base,
    BUILT_IN_THEMES.some((theme) => theme.id === base.id)
      ? "builtin"
      : "imported",
  );
  return base;
}

export function applyThemeManifest(
  value: ThemeManifestV2,
  source?: "imported" | "runtime" | "builtin",
): void {
  const theme = parseThemeManifestV2(value);
  validateThemeAccessibility(theme);
  const root = document.documentElement;
  const appearance = root.dataset.appearance === "light" ? "light" : "dark";
  beginThemeTransition("theme");
  root.dataset.theme = theme.id;
  root.dataset.uiMaterial = theme.material ?? "flat";
  root.dataset.uiLayout = theme.layout;
  setCssTokens(themeCssVariables(theme, appearance, loadDensityPreference()));
  const legacyRaw = localStorage.getItem(THEME_STORAGE_KEY);
  const hasBackup = localStorage.getItem(THEME_V1_BACKUP_STORAGE_KEY) !== null;
  if (legacyRaw && !hasBackup) {
    try {
      localStorage.setItem(THEME_V1_BACKUP_STORAGE_KEY, legacyRaw);
    } catch {
      themeMigrationError =
        "Your previous theme is still preserved, but its backup could not be saved. Check local storage space and try again.";
      window.dispatchEvent(new Event("doolittle:ui-layout-change"));
      window.dispatchEvent(
        new CustomEvent<ThemeManifestV2>(THEME_MANIFEST_CHANGE_EVENT, {
          detail: theme,
        }),
      );
      return;
    }
  }
  localStorage.setItem(THEME_V2_STORAGE_KEY, JSON.stringify(theme));
  localStorage.setItem(UI_LAYOUT_STORAGE_KEY, theme.layout);
  window.dispatchEvent(new Event("doolittle:ui-layout-change"));
  window.dispatchEvent(
    new CustomEvent<ThemeManifestV2>(THEME_MANIFEST_CHANGE_EVENT, {
      detail: theme,
    }),
  );
  if (source) localStorage.setItem(THEME_SOURCE_STORAGE_KEY, source);
}

function migrateLegacyStoredTheme(raw: string): ThemeManifestV2 | null {
  let migrated: ThemeManifestV2;
  try {
    const profile = parseDesktopThemeProfile(JSON.parse(raw));
    if (!profile) return null;
    migrated = migrateLegacyThemeBundle({
      kind: "doolittle.theme",
      version: 1,
      theme: { ...profile },
      appearance: loadAppearancePreference(),
      density: loadDensityPreference(),
    }).theme;
  } catch {
    return null;
  }
  try {
    // Preserve the byte-exact legacy value before writing the v2 preference.
    localStorage.setItem(THEME_V1_BACKUP_STORAGE_KEY, raw);
    localStorage.setItem(THEME_V2_STORAGE_KEY, JSON.stringify(migrated));
    localStorage.setItem(UI_LAYOUT_STORAGE_KEY, migrated.layout);
    themeMigrationError = "";
    return migrated;
  } catch {
    themeMigrationError =
      "Your previous theme is still preserved, but its backup could not be saved. Check local storage space and try again.";
    return migrated;
  }
}

export function loadStoredThemeManifest(): ThemeManifestV2 {
  themeMigrationError = "";
  const stored = localStorage.getItem(THEME_V2_STORAGE_KEY);
  if (stored) {
    try {
      const theme = parseThemeManifestV2(JSON.parse(stored));
      validateThemeAccessibility(theme);
      const selection = splitThemeSelection(theme.id);
      const record = loadThemeColorSelection();
      const preset = selection.color
        ? BUILT_IN_THEMES.find((candidate) => candidate.id === selection.theme)
        : undefined;
      if (preset && record?.color.name === selection.color) {
        try {
          // Recompose from the current preset so built-in layout updates
          // reach stored selections while the chosen palette persists.
          return composeThemeManifest(
            preset,
            themeColorOverlay(record.color, preset),
          );
        } catch {
          themeMigrationError =
            "The saved color theme could not be applied; the interface theme was loaded without it.";
          return preset;
        }
      }
      if (localStorage.getItem(THEME_SOURCE_STORAGE_KEY) === "builtin") {
        return (
          BUILT_IN_THEMES.find((preset) => preset.id === theme.id) ?? theme
        );
      }
      return theme;
    } catch {
      themeMigrationError =
        "The saved theme was invalid; Companion was loaded.";
    }
  }
  const legacy = localStorage.getItem(THEME_STORAGE_KEY);
  if (legacy) {
    const migrated = migrateLegacyStoredTheme(legacy);
    if (migrated) return migrated;
  }
  return COMPANION_THEME;
}

export function getThemeMigrationError(): string {
  return themeMigrationError;
}

export function legacyThemeProfile(
  theme: ThemeManifestV2,
): DesktopThemeProfile {
  const palette = theme.colors.dark;
  return {
    name: theme.id,
    label: theme.name,
    tagline: theme.description,
    primary: palette.accent,
    secondary: palette.accentHover ?? palette.accent,
    amberGlow: palette.warning,
    greenGlow: palette.success,
    cyanGlow: theme.terminalColors?.cyan,
    magentaGlow: theme.terminalColors?.magenta,
    muted: palette.mutedText,
    baseBg: theme.codeColors?.dark.background,
    baseFg: theme.codeColors?.dark.text,
    panelBg: theme.codeColors?.dark.background,
  };
}

export function applyDesktopAppearance(
  preference: DesktopAppearance,
  systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
): void {
  const root = document.documentElement;
  const resolved = resolveAppearance(preference, systemPrefersDark);
  beginThemeTransition("appearance");
  root.dataset.appearance = resolved;
  setCssTokens(
    resolved === "dark" ? DARK_DESKTOP_TOKENS : LIGHT_DESKTOP_TOKENS,
  );
  const selectedTheme = loadStoredThemeManifest();
  setCssTokens(
    themeCssVariables(selectedTheme, resolved, loadDensityPreference()),
  );
  root.style.colorScheme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.appearancePreference = preference;
  localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
}

export function applyDesktopDensity(density: DesktopDensity): void {
  beginThemeTransition("density");
  setCssTokens(
    density === "compact" ? COMPACT_DESKTOP_TOKENS : COMFORTABLE_DESKTOP_TOKENS,
  );
  document.documentElement.dataset.density = density;
  localStorage.setItem(DENSITY_STORAGE_KEY, density);
  setCssTokens(
    themeCssVariables(
      loadStoredThemeManifest(),
      document.documentElement.dataset.appearance === "light"
        ? "light"
        : "dark",
      density,
    ),
  );
}

export function loadStoredDesktopTheme(): DesktopThemeProfile | null {
  try {
    return legacyThemeProfile(loadStoredThemeManifest());
  } catch {
    return null;
  }
}

export function loadDesktopThemeSource():
  | "builtin"
  | "imported"
  | "runtime"
  | null {
  const source = localStorage.getItem(THEME_SOURCE_STORAGE_KEY);
  return source === "builtin" || source === "imported" || source === "runtime"
    ? source
    : null;
}

export function loadAppearancePreference(): DesktopAppearance {
  const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
  return stored === "light" || stored === "system" ? stored : "dark";
}

export function loadDensityPreference(): DesktopDensity {
  return localStorage.getItem(DENSITY_STORAGE_KEY) === "compact"
    ? "compact"
    : "comfortable";
}

export function resolveAppearance(
  preference: DesktopAppearance,
  systemPrefersDark: boolean,
): "dark" | "light" {
  return preference === "system"
    ? systemPrefersDark
      ? "dark"
      : "light"
    : preference;
}

export function announceAppearance(preference: DesktopAppearance): void {
  window.dispatchEvent(
    new CustomEvent<DesktopAppearance>(APPEARANCE_CHANGE_EVENT, {
      detail: preference,
    }),
  );
}

export function announceAppearanceApplied(appearance: "dark" | "light"): void {
  window.dispatchEvent(
    new CustomEvent<"dark" | "light">(APPEARANCE_APPLIED_EVENT, {
      detail: appearance,
    }),
  );
}

export function announceDensity(density: DesktopDensity): void {
  window.dispatchEvent(
    new CustomEvent<DesktopDensity>(DENSITY_CHANGE_EVENT, {
      detail: density,
    }),
  );
}

export function announceTheme(profile: DesktopThemeProfile): void {
  window.dispatchEvent(
    new CustomEvent<DesktopThemeProfile>(THEME_CHANGE_EVENT, {
      detail: profile,
    }),
  );
}

export interface DesktopThemeChangeHandlers {
  onAppearance: (appearance: DesktopAppearance) => void;
  onDensity: (density: DesktopDensity) => void;
  onTheme: (theme: DesktopThemeProfile) => void;
}

export function subscribeToDesktopThemeChanges(
  handlers: DesktopThemeChangeHandlers,
): () => void {
  const handleAppearance = (event: Event) => {
    const next = (event as CustomEvent<DesktopAppearance>).detail;
    if (next === "dark" || next === "light" || next === "system") {
      handlers.onAppearance(next);
    }
  };
  const handleDensity = (event: Event) => {
    const next = (event as CustomEvent<DesktopDensity>).detail;
    if (next === "compact" || next === "comfortable") {
      handlers.onDensity(next);
    }
  };
  const handleTheme = (event: Event) => {
    const profile = parseDesktopThemeProfile(
      (event as CustomEvent<unknown>).detail,
    );
    if (profile) handlers.onTheme(profile);
  };

  window.addEventListener(APPEARANCE_CHANGE_EVENT, handleAppearance);
  window.addEventListener(DENSITY_CHANGE_EVENT, handleDensity);
  window.addEventListener(THEME_CHANGE_EVENT, handleTheme);
  return () => {
    window.removeEventListener(APPEARANCE_CHANGE_EVENT, handleAppearance);
    window.removeEventListener(DENSITY_CHANGE_EVENT, handleDensity);
    window.removeEventListener(THEME_CHANGE_EVENT, handleTheme);
  };
}
