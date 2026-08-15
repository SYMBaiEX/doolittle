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
}

export const APPEARANCE_STORAGE_KEY = "doolittle.desktop.appearance";
export const DENSITY_STORAGE_KEY = "doolittle.desktop.density";
export const THEME_STORAGE_KEY = "doolittle.desktop.theme";
export const APPEARANCE_CHANGE_EVENT = "doolittle:appearance-change";
export const DENSITY_CHANGE_EVENT = "doolittle:density-change";
export const THEME_CHANGE_EVENT = "doolittle:theme-change";

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
  "--text-control": "12px",
  "--text-caption": "12px",
  "--text-body": "14px",
  "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "--sidebar-width": "280px",
  "--sidebar-compact-width": "68px",
  "--page-gap": "16px",
  "--page-pad-block": "32px 52px",
  "--page-pad-inline": "clamp(22px, 3.5vw, 52px)",
  "--card-pad": "18px",
  "--row-pad": "11px",
  "--control-height": "34px",
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
  "--shell-shadow-md":
    "0 10px 28px color-mix(in srgb, var(--shadow) 12%, transparent)",
  "--shell-shadow-lg":
    "0 18px 48px color-mix(in srgb, var(--shadow) 18%, transparent)",
  "--background": "var(--bg)",
  "--foreground": "var(--text)",
  "--card": "var(--surface-raised)",
  "--card-foreground": "var(--text)",
  "--popover": "var(--surface-raised)",
  "--popover-foreground": "var(--text)",
  "--bg-accent": "var(--surface-soft)",
  "--bg-elevated": "var(--surface-raised)",
  "--bg-hover": "var(--surface-hover)",
  "--bg-muted": "var(--surface-soft)",
  "--text-strong": "var(--text)",
  "--chat-text": "var(--text)",
  "--txt": "var(--text)",
  "--primary": "var(--accent)",
  "--primary-foreground": "var(--accent-ink)",
  "--secondary": "var(--surface-soft)",
  "--secondary-foreground": "var(--text)",
  "--muted-foreground": "var(--muted)",
  "--muted-strong": "var(--text-soft)",
  "--accent-foreground": "var(--accent-ink)",
  "--destructive": "var(--bad)",
  "--destructive-foreground": "var(--text)",
  "--destructive-subtle": "var(--bad-soft)",
  "--danger": "var(--bad)",
  "--input": "var(--surface-raised)",
  "--ring": "var(--accent)",
  "--radius": "var(--radius-sm)",
  "--ok": "var(--good)",
  "--ok-muted": "color-mix(in srgb, var(--good) 72%, transparent)",
  "--ok-subtle": "var(--good-soft)",
  "--warn-muted": "color-mix(in srgb, var(--warn) 72%, transparent)",
  "--warn-subtle": "var(--warn-soft)",
  "--status-success": "var(--good)",
  "--status-success-bg": "var(--good-soft)",
  "--status-danger": "var(--bad)",
  "--status-danger-bg": "var(--bad-soft)",
  "--status-warning": "var(--warn)",
  "--status-warning-bg": "var(--warn-soft)",
  "--status-info": "var(--text-soft)",
  "--status-info-bg": "var(--surface-soft)",
  "--mono": "var(--font-mono)",
  "--font-body": "var(--font-sans)",
  "--font-heading": "var(--font-display)",
  "--font-chat": "var(--font-sans)",
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
  "--muted": "#938b80",
  "--faint": "#6f685f",
  "--accent": "#ff6b16",
  "--accent-ink": "#1b0b02",
  "--accent-text": "var(--text)",
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
  "--muted": "#6f655d",
  "--faint": "#81766d",
  "--accent": "#df5700",
  "--accent-ink": "#1b0b02",
  "--accent-text": "var(--text)",
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
  "--page-gap": "11px",
  "--page-pad-block": "22px 36px",
  "--page-pad-inline": "clamp(18px, 2.7vw, 38px)",
  "--card-pad": "13px",
  "--row-pad": "8px",
  "--control-height": "30px",
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeColor(value: unknown, fallback: string): string {
  const candidate = stringValue(value);
  return candidate && CSS_COLOR.test(candidate) ? candidate : fallback;
}

export function parseDesktopThemeProfile(
  value: unknown,
): DesktopThemeProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  const name = stringValue(profile.name);
  const label = stringValue(profile.label);
  const primary = safeColor(profile.primary, "");
  if (!name || !label || !primary) return null;
  return {
    name,
    label,
    tagline: stringValue(profile.tagline),
    primary,
    secondary: safeColor(profile.secondary, primary),
    amberGlow: safeColor(profile.amberGlow, primary),
    greenGlow: safeColor(profile.greenGlow, "#86b875"),
  };
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
  return {
    "--accent": profile.primary,
    "--accent-ink": accentInk,
    "--accent-hover": profile.secondary,
    "--accent-soft": `color-mix(in srgb, ${profile.primary} 14%, var(--surface))`,
    "--accent-border": `color-mix(in srgb, ${profile.primary} 42%, var(--border))`,
    "--good": profile.greenGlow,
    "--warn": profile.amberGlow,
  };
}

export function applyDesktopTheme(profile: DesktopThemeProfile): void {
  const root = document.documentElement;
  root.dataset.theme = profile.name;
  for (const [property, value] of Object.entries(themeCssTokens(profile))) {
    root.style.setProperty(property, value);
  }
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(profile));
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
    density === "compact" ? COMPACT_DESKTOP_TOKENS : BASE_DESKTOP_TOKENS,
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
