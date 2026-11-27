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

/**
 * Canonical single-line ellipsized truncation for terminal chrome: whitespace
 * collapses to single spaces and the cut is codepoint-aware so astral glyphs
 * (emoji, non-BMP scripts) never split into lone surrogates. The ellipsis is
 * three ASCII dots so the output stays monospace-safe in every locale.
 */
export function ellipsizeText(text: string, max = 520): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const codepoints = Array.from(normalized);
  if (codepoints.length <= max) {
    return normalized;
  }
  return `${codepoints.slice(0, Math.max(0, max - 3)).join("")}...`;
}

/** Canonical HH:MM:SS clock stamp shared by every terminal chrome surface. */
export function formatClockTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Severity tokens. These are semantic and deliberately independent of the
 * decorative theme accents: a warning must read as a warning in every theme,
 * so the mapping is fixed rather than derived from the theme catalog.
 */
export type SeverityTone = "info" | "success" | "warning" | "error";

export const SEVERITY_BADGES: Record<SeverityTone, string> = {
  info: "::",
  success: "[ok]",
  warning: "[!]",
  error: "[x]",
};

/** Fixed blessed foreground names for severity, never theme-derived. */
export const SEVERITY_BLESSED_COLORS: Record<SeverityTone, string> = {
  info: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
};

/** Blessed-tagged severity token for tagged widget content. */
export function severityBlessedTag(tone: SeverityTone | undefined): string {
  const resolved: SeverityTone = tone ?? "info";
  return `{${SEVERITY_BLESSED_COLORS[resolved]}-fg}${SEVERITY_BADGES[resolved]}{/}`;
}
