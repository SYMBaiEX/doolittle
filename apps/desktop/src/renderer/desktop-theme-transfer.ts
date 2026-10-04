import {
  parseThemeBundleV2,
  parseThemeManifestV2,
  type ThemeBundleV2,
  type ThemeManifestV2,
} from "@doolittle/contracts/theme";
import { migrateLegacyThemeBundle } from "@doolittle/ui/themes";
import {
  type DesktopAppearance,
  type DesktopDensity,
  type DesktopThemeProfile,
  parseDesktopThemeProfile,
} from "./desktop-theme";

export const DESKTOP_THEME_BUNDLE_KIND = "doolittle.theme.bundle";
export const DESKTOP_THEME_BUNDLE_VERSION = 2;
export const DESKTOP_THEME_IMPORT_MAX_BYTES = 64 * 1024;

export type DesktopThemeBundle = ThemeBundleV2;

function parseLegacyThemeBundle(value: unknown): DesktopThemeBundle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bundle = value as Record<string, unknown>;
  if (bundle.kind !== "doolittle.theme" || bundle.version !== 1) return null;
  const theme = parseDesktopThemeProfile(
    bundle.theme,
  ) as DesktopThemeProfile | null;
  if (!theme) return null;
  if (
    bundle.appearance !== "dark" &&
    bundle.appearance !== "light" &&
    bundle.appearance !== "system"
  ) {
    return null;
  }
  if (bundle.density !== "compact" && bundle.density !== "comfortable") {
    return null;
  }
  try {
    return migrateLegacyThemeBundle({
      kind: "doolittle.theme",
      version: 1,
      theme: { ...theme },
      appearance: bundle.appearance,
      density: bundle.density,
    });
  } catch {
    return null;
  }
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
  const legacy = parseLegacyThemeBundle(value);
  if (legacy) return legacy;
  try {
    return parseThemeBundleV2(source);
  } catch {
    throw new Error(
      "Theme file uses an unsupported or invalid Doolittle theme format.",
    );
  }
}

export function serializeDesktopThemeBundle(
  theme: DesktopThemeProfile | ThemeManifestV2,
  appearance: DesktopAppearance,
  density: DesktopDensity,
): string {
  const isManifest = "version" in theme && theme.version === 2;
  const manifest = isManifest
    ? parseThemeManifestV2(theme)
    : migrateLegacyThemeBundle({
        kind: "doolittle.theme",
        version: 1,
        theme: { ...theme },
        appearance,
        density,
      }).theme;
  return `${JSON.stringify(
    {
      kind: DESKTOP_THEME_BUNDLE_KIND,
      version: DESKTOP_THEME_BUNDLE_VERSION,
      theme: manifest,
      appearance,
      density,
    } satisfies DesktopThemeBundle,
    null,
    2,
  )}\n`;
}

export function desktopThemeBundleFilename(
  theme: DesktopThemeProfile | ThemeManifestV2,
): string {
  const label = "version" in theme ? theme.name : theme.label;
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-|-$/gu, "");
  return `${id || "doolittle"}.doolittle-theme.json`;
}

export function downloadDesktopThemeBundle(
  theme: DesktopThemeProfile | ThemeManifestV2,
  appearance: DesktopAppearance,
  density: DesktopDensity,
): void {
  const blob = new Blob(
    [serializeDesktopThemeBundle(theme, appearance, density)],
    { type: "application/json" },
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
