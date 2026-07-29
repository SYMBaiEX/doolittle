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
