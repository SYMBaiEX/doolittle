import { getReadableTextColor } from "@doolittle/agent/runtime/theme-catalog";

/**
 * Shared terminal presentation primitives.
 *
 * Surfaces painted with a theme accent (header banner, selected rows) must
 * derive their foreground through the WCAG contrast ladder instead of
 * hardcoding black/white or decorative accent colors: the catalog spans
 * near-black to near-white primaries, so no fixed foreground survives all
 * themes. Severity colors are a separate concern and never derive from
 * decorative theme accents.
 */

export interface ContrastSelectionStyle {
  bg: string;
  fg: string;
}

/** Contrast-safe foreground/background pair for a colored surface. */
export function contrastSelectionStyle(
  background: string,
): ContrastSelectionStyle {
  return {
    bg: background,
    fg: getReadableTextColor(background),
  };
}
