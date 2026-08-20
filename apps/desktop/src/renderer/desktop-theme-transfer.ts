import {
  type DesktopAppearance,
  type DesktopDensity,
  type DesktopThemeProfile,
  parseDesktopThemeProfile,
} from "./desktop-theme";

export const DESKTOP_THEME_BUNDLE_KIND = "doolittle.theme";
export const DESKTOP_THEME_BUNDLE_VERSION = 1;
export const DESKTOP_THEME_IMPORT_MAX_BYTES = 64 * 1024;

export interface DesktopThemeBundle {
  kind: typeof DESKTOP_THEME_BUNDLE_KIND;
  version: typeof DESKTOP_THEME_BUNDLE_VERSION;
  theme: DesktopThemeProfile;
  appearance: DesktopAppearance;
  density: DesktopDensity;
}

function isAppearance(value: unknown): value is DesktopAppearance {
  return value === "dark" || value === "light" || value === "system";
}

function isDensity(value: unknown): value is DesktopDensity {
  return value === "compact" || value === "comfortable";
}

export function parseDesktopThemeBundle(source: string): DesktopThemeBundle {
  if (
    new TextEncoder().encode(source).byteLength > DESKTOP_THEME_IMPORT_MAX_BYTES
  ) {
    throw new Error("Theme files must be 64 KB or smaller.");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Theme file is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Theme file must contain a Doolittle theme bundle.");
  }
  const bundle = value as Record<string, unknown>;
  if (
    bundle.kind !== DESKTOP_THEME_BUNDLE_KIND ||
    bundle.version !== DESKTOP_THEME_BUNDLE_VERSION
  ) {
    throw new Error("Theme file uses an unsupported Doolittle theme format.");
  }
  const theme = parseDesktopThemeProfile(bundle.theme);
  if (!theme) throw new Error("Theme file contains an invalid color profile.");
  if (!isAppearance(bundle.appearance) || !isDensity(bundle.density)) {
    throw new Error(
      "Theme file contains invalid appearance or density settings.",
    );
  }
  return {
    kind: DESKTOP_THEME_BUNDLE_KIND,
    version: DESKTOP_THEME_BUNDLE_VERSION,
    theme,
    appearance: bundle.appearance,
    density: bundle.density,
  };
}

export function serializeDesktopThemeBundle(
  theme: DesktopThemeProfile,
  appearance: DesktopAppearance,
  density: DesktopDensity,
): string {
  const parsed = parseDesktopThemeProfile(theme);
  if (!parsed) throw new Error("A valid theme profile is required for export.");
  return `${JSON.stringify(
    {
      kind: DESKTOP_THEME_BUNDLE_KIND,
      version: DESKTOP_THEME_BUNDLE_VERSION,
      theme: parsed,
      appearance,
      density,
    } satisfies DesktopThemeBundle,
    null,
    2,
  )}\n`;
}

export function desktopThemeBundleFilename(theme: DesktopThemeProfile): string {
  const name = theme.name
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-|-$/gu, "");
  return `${name || "doolittle"}.doolittle-theme.json`;
}

export function downloadDesktopThemeBundle(
  theme: DesktopThemeProfile,
  appearance: DesktopAppearance,
  density: DesktopDensity,
): void {
  const blob = new Blob(
    [serializeDesktopThemeBundle(theme, appearance, density)],
    {
      type: "application/json",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = desktopThemeBundleFilename(theme);
  link.href = url;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
