import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builtCliEntry,
  createTerminalProfile,
  destroyTerminalSession,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

describe("small-terminal startup fallback acceptance", () => {
  it("keeps the cockpit fallback explanation visible in the plain shell viewport", async () => {
    terminal = spawnTerminalSession({
      argv: [builtCliEntry, "--cli"],
      cols: 60,
      rows: 15,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    await terminal.waitForGridText(
      "Terminal too small for the cockpit",
      60_000,
    );
    await terminal.waitForGridText("Using the plain CLI", 10_000);
    // Let post-prompt startup log lines land before reading the final visible
    // viewport. The fallback notice is emitted after the synchronous boot log
    // batch precisely so those noisy lines cannot push it out of a tiny shell.
    await sleep(1_000);

    const lines = await terminal.gridLines();
    expect(lines).toHaveLength(15);
    const grid = lines.join("\n");
    expect(grid).toContain("Terminal too small for the cockpit");
    expect(grid).toContain("minimum 80x24");
    expect(grid).toContain("Using the plain CLI");
    expect(grid).toContain("terminalfixture@");
  }, 90_000);
});
