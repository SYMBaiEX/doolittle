/**
 * Environment evidence consulted by terminal capability primitives. Each
 * primitive reads only the fields relevant to its policy; the combined shape
 * keeps the shared API compatible with both the plain CLI and bootstrap
 * call sites that previously owned separate copies.
 */
export interface TerminalCapabilityEnv {
  NO_COLOR?: string | undefined;
  FORCE_COLOR?: string | undefined;
  COLORFGBG?: string | undefined;
  LC_ALL?: string | undefined;
  LC_CTYPE?: string | undefined;
  LANG?: string | undefined;
}
