import type { TerminalCapabilityEnv } from "./types";

/**
 * Central glyph selection for terminal chrome.
 *
 * Unicode glyphs (box drawing, arrows, blocks, middle dots) render as
 * mojibake or misaligned widths in POSIX/C locales, so every decorative
 * non-ASCII glyph must be chosen through here rather than hardcoded: the
 * ASCII fallback set always renders. Severity/role badges in
 * presentation.ts are already pure ASCII by design.
 *
 * Locale detection honors standard precedence (LC_ALL over LC_CTYPE over
 * LANG). An explicitly non-UTF-8 locale (C, POSIX, ISO-8859-*) selects the
 * ASCII set; absent locale variables give no contrary evidence, and modern
 * terminal emulators negotiate UTF-8 rendering regardless, so the unicode
 * set stays.
 */

const UTF8_PATTERN = /utf-?8/iu;

export function supportsTerminalUnicode(
  env: TerminalCapabilityEnv = process.env,
): boolean {
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG;
  if (!locale) {
    return true;
  }
  return UTF8_PATTERN.test(locale);
}

/** Pick the unicode glyph when supported, otherwise the ASCII fallback. */
export function terminalGlyph(
  unicode: string,
  ascii: string,
  unicodeSupported: boolean = supportsTerminalUnicode(),
): string {
  return unicodeSupported ? unicode : ascii;
}
