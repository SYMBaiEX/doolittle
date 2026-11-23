import {
  parseThemeManifestV2,
  type SemanticPalette,
  type ThemeManifestV2,
} from "@doolittle/contracts/theme";

/**
 * Layout themes and runtime color palettes are two independent axes that
 * compose into one applied manifest. The layout manifest owns surfaces,
 * typography, spacing, geometry, density, motion and material; a color
 * selection contributes accent, status, terminal and editor colors on top.
 */

export interface ThemeColorOverlay {
  /** Runtime palette name recorded in the composed manifest identity. */
  name: string;
  /** Display label, used for the composed manifest name when present. */
  label?: string;
  /** Partial palettes merge over the base so missing keys keep base values. */
  light?: Partial<SemanticPalette>;
  dark?: Partial<SemanticPalette>;
  codeColors?: {
    light?: { background: string; text: string };
    dark?: { background: string; text: string };
  };
  terminalColors?: ThemeManifestV2["terminalColors"];
}

export interface ThemeSelection {
  theme: string;
  color: string | null;
}

const THEME_MANIFEST_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const THEME_SELECTION_SEPARATOR = ".";

/**
 * Selection identity is `<theme id>.<color name>`; the separator is the first
 * dot, so color names keep any characters they carry while layout ids stay
 * dot-free (every built-in id is). Ids that would exceed the manifest id
 * alphabet or length fall back to the bare layout id — the manifest stays
 * valid and the color name is still carried by its palette.
 */
export function themeSelectionId(themeId: string, colorName: string): string {
  const color = colorName.trim().toLowerCase();
  if (!color) return themeId;
  const id = `${themeId}${THEME_SELECTION_SEPARATOR}${color}`;
  return THEME_MANIFEST_ID.test(id) ? id : themeId;
}

/** Inverse of themeSelectionId: splits at the first separator. */
export function splitThemeSelection(id: string): ThemeSelection {
  const separator = id.indexOf(THEME_SELECTION_SEPARATOR);
  if (separator <= 0 || separator === id.length - 1) {
    return { theme: id, color: null };
  }
  return {
    theme: id.slice(0, separator),
    color: id.slice(separator + 1),
  };
}

/**
 * Compose a color overlay onto a base manifest. Everything except palette
 * fields comes from the base, so every combination of layout and runtime
 * color resolves to a valid manifest. Recomposing an already-composed base
 * replaces its color suffix instead of stacking identities.
 */
export function composeThemeManifest(
  base: ThemeManifestV2,
  overlay: ThemeColorOverlay,
): ThemeManifestV2 {
  const baseId = splitThemeSelection(base.id).theme;
  // A color overlay usually carries a dark editor palette only; the missing
  // appearance falls back to the base's editor colors, then to base surfaces.
  const codeColors =
    overlay.codeColors || base.codeColors
      ? {
          light: overlay.codeColors?.light ??
            base.codeColors?.light ?? {
              background: base.colors.light.raised,
              text: base.colors.light.text,
            },
          dark: overlay.codeColors?.dark ??
            base.codeColors?.dark ?? {
              background: base.colors.dark.raised,
              text: base.colors.dark.text,
            },
        }
      : undefined;
  return parseThemeManifestV2({
    ...base,
    id: themeSelectionId(baseId, overlay.name),
    name: overlay.label
      ? `${base.name} + ${overlay.label}`.slice(0, 80)
      : base.name,
    colors: {
      light: { ...base.colors.light, ...overlay.light },
      dark: { ...base.colors.dark, ...overlay.dark },
    },
    ...(codeColors ? { codeColors } : {}),
    terminalColors: overlay.terminalColors ?? base.terminalColors,
  });
}
