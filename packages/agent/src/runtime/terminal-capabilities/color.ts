import { stdout as defaultOutput } from "node:process";
import type { TerminalCapabilityEnv } from "./types";

/**
 * Central terminal color policy for plain (non-blessed) output.
 *
 * Two decisions live here and nowhere else:
 *
 * 1. Whether color is enabled at all. Resolution order matches the Node and
 *    chalk ecosystem: an explicit non-empty, non-zero FORCE_COLOR wins over
 *    everything; a non-empty NO_COLOR disables color even on a TTY; otherwise
 *    color follows the stream's TTY state.
 * 2. Which palette variant semantic roles use. ANSI colors were chosen for
 *    dark terminals; on light backgrounds (detected through the COLORFGBG
 *    convention) roles that wash out shift to readable variants.
 *
 * Roles are semantic, not decorative-theme-derived. Severity roles
 * (warning/error/success) are fixed ANSI colors in every theme so a warning
 * reads as a warning regardless of the cockpit theme catalog entry. The TUI
 * side of the severity contract lives in presentation.ts.
 */

export interface TerminalColorPolicy {
  enabled: boolean;
  background: "light" | "dark";
}

export type PlainTextRole =
  | "accent"
  | "emphasis"
  | "info"
  | "success"
  | "muted"
  | "warning"
  | "error";

/** Whether the stream may receive ANSI color under the current environment. */
export function terminalColorEnabled(
  stream: { isTTY?: boolean | undefined } = defaultOutput,
  env: TerminalCapabilityEnv = process.env,
): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") {
    return env.FORCE_COLOR !== "0";
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }
  return stream.isTTY === true;
}

function backgroundScheme(env: TerminalCapabilityEnv): "light" | "dark" {
  const colorfgbg = env.COLORFGBG;
  if (!colorfgbg) {
    return "dark";
  }
  const segments = colorfgbg.split(";");
  const bg = Number.parseInt(segments.at(-1) ?? "", 10);
  if (Number.isNaN(bg)) {
    return "dark";
  }
  // ANSI color index of the terminal background: 0-6 and bright black (8)
  // are dark surfaces; white (7) and the bright 9-15 range read as light.
  return bg === 7 || bg >= 9 ? "light" : "dark";
}

export function resolveTerminalColorPolicy(
  stream: { isTTY?: boolean | undefined } = defaultOutput,
  env: TerminalCapabilityEnv = process.env,
): TerminalColorPolicy {
  return {
    enabled: terminalColorEnabled(stream, env),
    background: backgroundScheme(env),
  };
}

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";

const ROLE_ANSI: Record<PlainTextRole, { dark: string; light: string }> = {
  accent: { dark: "\x1b[35m", light: "\x1b[35m" },
  emphasis: { dark: "\x1b[33m", light: "\x1b[33m" },
  // Cyan washes out on white terminal backgrounds; blue stays readable.
  info: { dark: "\x1b[36m", light: "\x1b[34m" },
  success: { dark: "\x1b[32m", light: "\x1b[32m" },
  muted: { dark: "\x1b[90m", light: "\x1b[90m" },
  warning: { dark: "\x1b[33m", light: "\x1b[33m" },
  error: { dark: "\x1b[31m", light: "\x1b[31m" },
};

/** Paint text in a semantic role, honoring the resolved color policy. */
export function paintText(
  text: string,
  role: PlainTextRole,
  policy: TerminalColorPolicy,
  options?: { bold?: boolean },
): string {
  if (!policy.enabled) {
    return text;
  }
  const color = ROLE_ANSI[role][policy.background];
  return `${options?.bold ? ANSI_BOLD : ""}${color}${text}${ANSI_RESET}`;
}
