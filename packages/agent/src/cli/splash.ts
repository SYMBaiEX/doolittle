/**
 * Boot splash screen for Eliza Agent.
 *
 * Displays the Eliza character alongside the elizaOS wordmark in
 * ANSI-colored ASCII art. Skipped in non-TTY environments or when
 * ELIZA_AGENT_SKIP_SPLASH=1.
 */

// Color palette (ANSI 24-bit / truecolor)
const O = "\x1b[38;2;255;106;0m\x1b[1m"; // orange (brand)
const H = "\x1b[38;2;30;30;45m\x1b[1m"; // dark hair
const S = "\x1b[38;2;255;220;185m"; // skin
const E = "\x1b[38;2;230;140;50m"; // amber eyes
const M = "\x1b[38;2;200;80;80m"; // mouth / blush
const C = "\x1b[38;2;85;214;255m"; // cyan accent
const D = "\x1b[2m"; // dim
const R = "\x1b[0m"; // reset

/* eslint-disable no-irregular-whitespace */
const SPLASH_LINES = [
  ``,
  `${H}           @@@@@@@@@@${R}`,
  `${H}         @@@@@@@@@@@@@@${R}`,
  `${H}       @@@@@@@@@@@@@@@@@@${R}`,
  `${H}      @@@@@${S}@@@@@@@@@@${H}@@@@${R}`,
  `${H}     @@@@${S}@@@@@@@@@@@@${H}@@@@${R}`,
  `${H}    @@@@${S}@@${E}@@${S}@@@@@@${E}@@${S}@@${H}@@@${R}          ${O}         lll  oo                    OOOOO   SSSSS${R}`,
  `${H}    @@@${S}@@@@@@@@@@@@@@${H}@@@@${R}          ${O}  eeeee  ll  ii zzzzz  aaaa          OO  OO SS${R}`,
  `${H}   @@@@${S}@@@@@@@@@@@@@@${H}@@@@${R}          ${O} ee   ee ll  ii    zz aa  aa         OO  OO  SSSS${R}`,
  `${H}   @@@@${S}@@@@@@${M}@@${S}@@@@@@${H}@@@@${R}          ${O} eeeee  ll  ii   zz  aa  aa         OO  OO     SS${R}`,
  `${H}    @@@${S}@@@@@@@@@@@@@@${H}@@@${R}           ${O} ee     ll  ii  zz   aa  aa         OO  OO SS  SS${R}`,
  `${H}     @@@@${S}@@@@@@@@@@${H}@@@@${R}             ${O}  eeeee lll ii zzzzz  aaaa  ......  OOOOO  SSSSS${R}`,
  `${H}      @@@@@${S}@@@@@@${H}@@@@@${R}`,
  `${O}       @@@@@@@@@@@@@@@@${R}`,
  `${O}      @@@@@@@@@@@@@@@@@@${R}              ${D}${C}AGENT // CYPHERPUNK OPERATOR SHELL${R}`,
  `${O}     @@@@@@@@@@@@@@@@@@@@${R}`,
  `${O}    @@@@@@@@@@@@@@@@@@@@@@${R}`,
  `${O}    @@@@@@@@@@@@@@@@@@@@@@@${R}           ${D}Booting workspace...${R}`,
  `${O}    @@@@@@@@  @@@@  @@@@@@@@${R}`,
  `${O}     @@@@@@@  @@@@  @@@@@@@${R}`,
  `${O}      @@@@@@  @@@@  @@@@@@${R}`,
  `${H}      @@@@@@@  @@  @@@@@@@${R}`,
  `${H}     @@@@@@@@@    @@@@@@@@@${R}`,
  ``,
];

const SPLASH_ART = SPLASH_LINES.join("\n");

/**
 * Show the boot splash screen if we're in an interactive TTY and
 * the user hasn't opted out via ELIZA_AGENT_SKIP_SPLASH=1.
 *
 * @param durationMs How long to show the splash (default 1500ms).
 */
export async function showBootSplash(durationMs = 1500): Promise<void> {
  if (process.env.ELIZA_AGENT_SKIP_SPLASH === "1") {
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
