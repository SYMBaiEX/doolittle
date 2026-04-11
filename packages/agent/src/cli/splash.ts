/**
 * Boot splash screen for Doolittle.
 *
 * Displays Eliza in a lab coat alongside the Doolittle wordmark in
 * ANSI-colored ASCII art. Skipped in non-TTY environments or when
 * DOOLITTLE_SKIP_SPLASH=1.
 */

// Color palette (ANSI 24-bit / truecolor)
const O = "\x1b[38;2;255;106;0m\x1b[1m"; // orange (brand)
const H = "\x1b[38;2;30;30;45m\x1b[1m"; // dark hair
const S = "\x1b[38;2;255;220;185m"; // skin
const E = "\x1b[38;2;230;140;50m"; // amber eyes
const M = "\x1b[38;2;200;80;80m"; // mouth / blush
const L = "\x1b[38;2;239;244;255m\x1b[1m"; // lab coat
const C = "\x1b[38;2;85;214;255m"; // cyan accent
const D = "\x1b[2m"; // dim
const R = "\x1b[0m"; // reset

/* eslint-disable no-irregular-whitespace */
const SPLASH_LINES = [
  ``,
  `${H}            @@@@@@@@@@@${R}`,
  `${H}          @@@@@@@@@@@@@@@${R}`,
  `${H}        @@@@@@@@@@@@@@@@@@@${R}`,
  `${H}       @@@@@@@${S}@@@@@@@@@${H}@@@@@@${R}`,
  `${H}      @@@@@${S}@@@@${E}@@${S}@@${E}@@${S}@@@@${H}@@@@@${R}      ${O}DOOLITTLE${R}`,
  `${H}     @@@@@${S}@@@@@@@@${M}@@${S}@@@@@@${H}@@@@@${R}      ${D}${C}ELIZA // CYPHERPUNK OPERATOR SHELL${R}`,
  `${H}     @@@@@${S}@@@@@@${M}____${S}@@@@@@${H}@@@@@${R}`,
  `${H}      @@@@@${S}@@@@@${H}@@@@@@${S}@@@@@${H}@@@@${R}       ${D}Booting workspace...${R}`,
  `${H}       @@@@@${S}@@@@${H}@@@@@@${S}@@@@${H}@@@@${R}`,
  `${L}        _____${H}@@${R}${L}___${H}@@${R}${L}_____ ${R}`,
  `${L}       / ____\\   /____ \\${R}`,
  `${L}      / / __  \\ /  __ \\ \\${R}`,
  `${L}     / /_/ /\\  V  / /_/ /${R}`,
  `${L}    /_____/_/\\___/\\____/ ${R}`,
  `${L}       /_/        \\_\\${R}`,
  `${L}      /_/          \\_\\${R}`,
  ``,
];

const SPLASH_ART = SPLASH_LINES.join("\n");

/**
 * Show the boot splash screen if we're in an interactive TTY and
 * the user hasn't opted out via DOOLITTLE_SKIP_SPLASH=1.
 *
 * @param durationMs How long to show the splash (default 1500ms).
 */
export async function showBootSplash(durationMs = 1500): Promise<void> {
  if (process.env.DOOLITTLE_SKIP_SPLASH === "1") {
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  // Hide cursor
  process.stdout.write("\x1b[?25l");
  // Clear screen and move to top-left
  process.stdout.write("\x1b[2J\x1b[H");

  process.stdout.write(SPLASH_ART);
  process.stdout.write("\n");

  await new Promise((resolve) => setTimeout(resolve, durationMs));

  // Clear screen and restore cursor
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write("\x1b[?25h");
}
