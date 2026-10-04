import { z } from "zod";

export const UI_LAYOUT_PRESETS = ["companion", "canvas"] as const;
export type UiLayoutPreset = (typeof UI_LAYOUT_PRESETS)[number];

const color = z.string().regex(/^#[\da-f]{6}$/iu);
const font = z.enum(["system", "avenir", "humanist", "monospace"]);
const dimension = (min: number, max: number) =>
  z.number().finite().min(min).max(max);

/** Semantic data only: no CSS, URLs, selectors, scripts, or executable layouts. */
export const semanticPaletteSchema = z
  .object({
    background: color,
    navigation: color,
    raised: color,
    subtle: color,
    hover: color,
    border: color,
    borderStrong: color,
    text: color,
    secondaryText: color,
    mutedText: color,
    accent: color,
    accentHover: color.optional(),
    accentInk: color,
    accentText: color,
    success: color,
    warning: color,
    error: color,
  })
  .strict();

export const themeManifestV2Schema = z
  .object({
    kind: z.literal("doolittle.theme"),
    version: z.literal(2),
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(240),
    layout: z.enum(UI_LAYOUT_PRESETS),
    colors: z
      .object({ light: semanticPaletteSchema, dark: semanticPaletteSchema })
      .strict(),
    codeColors: z
      .object({
        light: z.object({ background: color, text: color }).strict(),
        dark: z.object({ background: color, text: color }).strict(),
      })
      .strict()
      .optional(),
    terminalColors: z
      .object({
        blue: color,
        brightBlue: color,
        cyan: color,
        magenta: color,
        muted: color.optional(),
      })
      .strict()
      .optional(),
    typography: z
      .object({
        bodyFont: font,
        codeFont: z.literal("monospace"),
        conversationSize: dimension(16, 22),
        controlSize: dimension(14, 18),
        metadataSize: dimension(12, 16),
        lineHeight: dimension(1.4, 1.8),
      })
      .strict(),
    spacing: z
      .object({
        unit: dimension(4, 8),
        row: dimension(6, 20),
        page: dimension(12, 40),
      })
      .strict(),
    geometry: z
      .object({
        navigationWidth: dimension(212, 360),
        inspectorWidth: dimension(280, 480),
        readingWidth: dimension(640, 1100),
        controlRadius: dimension(0, 16),
        composerRadius: dimension(0, 24),
        controlHeight: dimension(40, 52),
        touchHeight: dimension(44, 60),
        headerHeight: dimension(48, 64),
      })
      .strict(),
    density: z.enum(["compact", "comfortable"]),
    motion: z
      .object({
        durationMs: dimension(0, 200),
        reducedMotion: z.literal("respect-system"),
      })
      .strict(),
  })
  .strict();

export type SemanticPalette = z.infer<typeof semanticPaletteSchema>;
export type ThemeManifestV2 = z.infer<typeof themeManifestV2Schema>;

export const themeBundleV2Schema = z
  .object({
    kind: z.literal("doolittle.theme.bundle"),
    version: z.literal(2),
    theme: themeManifestV2Schema,
    appearance: z.enum(["dark", "light", "system"]),
    density: z.enum(["compact", "comfortable"]),
  })
  .strict();
export type ThemeBundleV2 = z.infer<typeof themeBundleV2Schema>;

export const THEME_IMPORT_MAX_BYTES = 64 * 1024;

export function parseThemeManifestV2(value: unknown): ThemeManifestV2 {
  return themeManifestV2Schema.parse(value);
}

/** Reject oversized/non-JSON data before validation. Migration is host-controlled. */
export function parseThemeBundleV2(source: string): ThemeBundleV2 {
  if (new TextEncoder().encode(source).byteLength > THEME_IMPORT_MAX_BYTES) {
    throw new Error("Theme files must be 64 KB or smaller.");
  }
  return themeBundleV2Schema.parse(JSON.parse(source));
}
