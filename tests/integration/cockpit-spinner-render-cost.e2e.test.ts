import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTerminalProfile,
  destroyTerminalSession,
  resolveNubExecutable,
  sourceCliEntry,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

const COLS = 160;
const ROWS = 30;
const BOOT_TIMEOUT_MS = 45_000;

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

interface SpinnerStats {
  ticks: number;
  skippedUnchanged: number;
  partialPaints: number;
  fullRenders: number;
}

describe("cockpit busy spinner render cost", () => {
  it("paints busy frames through footer-row draws, not whole-screen renders", async () => {
    const statsPath = resolve(fixture.profile, "spinner-stats.json");
    const session = spawnTerminalSession({
      command: resolveNubExecutable(),
      argv: [sourceCliEntry, "--cli"],
      cols: COLS,
      rows: ROWS,
      cwd: fixture.profile,
      env: {
        ...fixture.environment,
        DOOLITTLE_SPINNER_STATS: statsPath,
      },
    });
    terminal = session;
    await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);

    session.type("!sleep 3");
    session.key("enter");
    await session.waitForGridText("processing", 10_000);
    await session.waitForGridText("run complete", 20_000);

    // stopBusySpinner writes the diagnostic snapshot for the busy window.
    const stats: SpinnerStats = JSON.parse(readFileSync(statsPath, "utf8"));

    // Three busy seconds at the 120ms cadence is ~25 ticks. The pre-fix
    // spinner re-rendered the entire screen on every one of them; now the
    // overwhelming majority paint through footer-row draws, with only the
    // rare consistency backstop paying for a full render.
    expect(stats.ticks).toBeGreaterThanOrEqual(12);
    expect(stats.partialPaints).toBeGreaterThanOrEqual(10);
    expect(stats.partialPaints).toBeGreaterThan(stats.fullRenders * 4);
  }, 120_000);
});
