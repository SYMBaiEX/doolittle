import { stdout as defaultOutput } from "node:process";

/**
 * Terminal capability policy for bootstrap line-mode output.
 *
 * This deliberately mirrors the CLI's central policy in
 * apps/cli/src/cli/terminal-color.ts and terminal-glyphs.ts: scripts cannot
 * import app code, so the same small rules are replicated here rather than
 * shared through a package. If a third consumer appears, the natural shared
 * home is @doolittle/agent; until then the two copies must stay in sync.
 *
 * Color resolution order matches the Node/chalk ecosystem: an explicit
 * non-empty, non-zero FORCE_COLOR wins over everything; a non-empty NO_COLOR
 * disables color even on a TTY; otherwise color follows the stream's TTY
 * state, so piped output stays free of escape bytes.
 *
 * Glyph resolution honors standard locale precedence (LC_ALL over LC_CTYPE
 * over LANG). An explicitly non-UTF-8 locale (C, POSIX, ISO-8859-*) selects
 * the ASCII fallback set; absent locale variables give no contrary evidence
 * and modern terminal emulators negotiate UTF-8 regardless, so the unicode
 * set stays.
 */

interface TerminalEnv {
  NO_COLOR?: string | undefined;
  FORCE_COLOR?: string | undefined;
  LC_ALL?: string | undefined;
  LC_CTYPE?: string | undefined;
  LANG?: string | undefined;
}

export function terminalColorEnabled(
  stream: { isTTY?: boolean | undefined } = defaultOutput,
  env: TerminalEnv = process.env,
): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") {
    return env.FORCE_COLOR !== "0";
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }
  return stream.isTTY === true;
}

const UTF8_PATTERN = /utf-?8/iu;

export function supportsTerminalUnicode(
  env: TerminalEnv = process.env,
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
