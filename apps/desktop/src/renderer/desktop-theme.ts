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
export const THEME_SOURCE_STORAGE_KEY = "doolittle.desktop.theme-source";
export const APPEARANCE_CHANGE_EVENT = "doolittle:appearance-change";
export const DENSITY_CHANGE_EVENT = "doolittle:density-change";
export const THEME_CHANGE_EVENT = "doolittle:theme-change";

const cssVariable = (name: string): string => `var(--${name})`;

const BASE_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--font-display":
    '"Avenir Next", "Segoe UI Variable Display", "Segoe UI", ui-sans-serif, sans-serif',
  "--font-sans":
    '"Avenir Next", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif',
  "--font-mono":
    '"SFMono-Regular", "Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", ui-monospace, monospace',
  "--radius-xs": "5px",
  "--radius-sm": "8px",
  "--radius-md": "11px",
  "--radius-lg": "14px",
  "--radius-xl": "18px",
  "--text-meta": "10px",
  "--text-control": "11px",
  "--text-caption": "11px",
  "--text-body": "13px",
  "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "--sidebar-width": "280px",
  "--sidebar-compact-width": "68px",
  "--page-gap": "14px",
  "--page-pad-block": "22px 30px",
  "--page-pad-inline": "clamp(16px, 2.5vw, 36px)",
  "--page-header-min-height": "64px",
  "--page-header-pad-bottom": "11px",
  "--page-title-size": "clamp(17px, 1.3vw, 20px)",
  "--chat-welcome-title-size": "clamp(20px, 2vw, 24px)",
  "--card-pad": "15px",
  "--row-pad": "9px",
  "--control-height": "32px",
  "--page-readable-meta": "9px",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--operator-line": "color-mix(in srgb, var(--accent) 36%, var(--border))",
  "--operator-glow": "color-mix(in srgb, var(--accent) 8%, transparent)",
  "--surface-selected":
    "color-mix(in srgb, var(--accent) 7%, var(--surface-hover))",
  "--line-subtle": "color-mix(in srgb, var(--border) 72%, transparent)",
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
  "--accent-hover": "#c94e00",
  "--accent-soft": "#f5dfce",
  "--accent-border": "#d48b57",
  "--good": "#557c4a",
  "--good-soft": "#dfeada",
  "--warn": "#8e6b2f",
  "--warn-soft": "#efe5ce",
  "--bad": "#a44f43",
  "--bad-soft": "#f0dad5",
  "--shadow": "rgba(75, 58, 43, 0.12)",
};

const COMPACT_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--text-control": "10px",
  "--text-caption": "10px",
  "--text-body": "12px",
  "--page-gap": "10px",
  "--page-pad-block": "16px 22px",
  "--page-pad-inline": "clamp(12px, 2vw, 26px)",
  "--page-header-min-height": "54px",
  "--page-header-pad-bottom": "8px",
  "--page-title-size": "clamp(16px, 1.2vw, 18px)",
  "--chat-welcome-title-size": "clamp(18px, 1.8vw, 22px)",
  "--card-pad": "11px",
  "--row-pad": "6px",
  "--control-height": "28px",
};

const COMFORTABLE_DESKTOP_TOKENS: Readonly<Record<string, string>> = {
  "--text-control": "11px",
  "--text-caption": "11px",
  "--text-body": "13px",
  "--page-gap": "14px",
  "--page-pad-block": "22px 30px",
  "--page-pad-inline": "clamp(16px, 2.5vw, 36px)",
  "--page-header-min-height": "64px",
  "--page-header-pad-bottom": "11px",
  "--page-title-size": "clamp(17px, 1.3vw, 20px)",
  "--chat-welcome-title-size": "clamp(20px, 2vw, 24px)",
  "--card-pad": "15px",
  "--row-pad": "9px",
  "--control-height": "32px",
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
): Record<string, string> {
  const hex = profile.primary.match(/^#([\da-f]{6})$/iu)?.[1];
  const accentInk = hex
    ? (() => {
        const channels = [0, 2, 4].map((offset) =>
          Number.parseInt(hex.slice(offset, offset + 2), 16),
        );
        const luminance =
          (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
        return luminance >= 150 ? "#160b03" : "#fffaf5";
      })()
    : "#160b03";
  const canvasBackground = profile.panelBg ?? profile.baseBg ?? "#080706";
  const canvasText = profile.baseFg ?? "#f4f1eb";
  const cyan = profile.cyanGlow ?? profile.secondary;
  const magenta = profile.magentaGlow ?? profile.secondary;
  const tokens: Record<string, string> = {
    "--accent": profile.primary,
    "--accent-ink": accentInk,
    "--accent-text": `color-mix(in srgb, ${profile.primary} 72%, var(--text))`,
    "--accent-hover": profile.secondary,
    "--accent-soft": `color-mix(in srgb, ${profile.primary} 14%, var(--surface))`,
    "--accent-border": `color-mix(in srgb, ${profile.primary} 42%, var(--border))`,
    "--good": profile.greenGlow,
    "--good-soft": `color-mix(in srgb, ${profile.greenGlow} 14%, var(--surface))`,
    "--warn": profile.amberGlow,
    "--warn-soft": `color-mix(in srgb, ${profile.amberGlow} 14%, var(--surface))`,
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

export function applyDesktopTheme(
  profile: DesktopThemeProfile,
  source?: "imported" | "runtime",
): void {
  const root = document.documentElement;
  root.dataset.theme = profile.name;
  for (const [property, value] of Object.entries(themeCssTokens(profile))) {
    root.style.setProperty(property, value);
  }
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(profile));
  if (source) localStorage.setItem(THEME_SOURCE_STORAGE_KEY, source);
}

export function applyDesktopAppearance(
  preference: DesktopAppearance,
  systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
): void {
  const root = document.documentElement;
  const resolved = resolveAppearance(preference, systemPrefersDark);
  setCssTokens(
    resolved === "dark" ? DARK_DESKTOP_TOKENS : LIGHT_DESKTOP_TOKENS,
  );
  const selectedTheme = loadStoredDesktopTheme();
  if (selectedTheme) setCssTokens(themeCssTokens(selectedTheme));
  root.style.colorScheme = resolved;
  root.dataset.appearance = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.appearancePreference = preference;
  localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
}

export function applyDesktopDensity(density: DesktopDensity): void {
  setCssTokens(
    density === "compact" ? COMPACT_DESKTOP_TOKENS : COMFORTABLE_DESKTOP_TOKENS,
  );
  document.documentElement.dataset.density = density;
  localStorage.setItem(DENSITY_STORAGE_KEY, density);
}

export function loadStoredDesktopTheme(): DesktopThemeProfile | null {
  try {
    return parseDesktopThemeProfile(
      JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}

export function loadDesktopThemeSource(): "imported" | "runtime" | null {
  const source = localStorage.getItem(THEME_SOURCE_STORAGE_KEY);
  return source === "imported" || source === "runtime" ? source : null;
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
