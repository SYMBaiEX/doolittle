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

async function bootedCockpit(): Promise<TerminalSession> {
  const session = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [sourceCliEntry, "--cli"],
    cols: COLS,
    rows: ROWS,
    cwd: fixture.profile,
    env: fixture.environment,
  });
  terminal = session;
  await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
  await session.waitForGridText("queue:0", BOOT_TIMEOUT_MS);
  return session;
}

describe("cockpit overlay semantics", () => {
  it("restores a composer draft after Escape closes the overlay", async () => {
    const session = await bootedCockpit();

    session.key("ctrl-e");
    await session.waitForGridText("Multiline input", 5_000);
    session.type("overlay draft alpha");
    await session.waitForGridText("overlay draft alpha", 5_000);

    session.key("escape");
    await session.waitForGridText("Enter send", 5_000);
    await session.waitForGridTextAbsent("Multiline input", 5_000);

    session.key("ctrl-e");
    await session.waitForGridText("Multiline input", 5_000);
    await session.waitForGridText("overlay draft alpha", 5_000);
  }, 120_000);

  it("runs the arrow-selected palette command instead of the first match", async () => {
    const session = await bootedCockpit();

    session.key("ctrl-p");
    await session.waitForGridText("Search", 5_000);
    session.type("/th");
    await session.waitForGridText("/theme-list", 5_000);

    session.key("down");
    session.key("enter");

    // /theme-list has a distinct observable effect from /theme: it prints the
    // theme catalog rows, while the first match prints active=<name>.
    await session.waitForGridText("- orange ::", 15_000);
    const grid = await session.gridText();
    expect(grid).toContain("- blue ::");
    expect(grid).not.toContain("active=orange");
  }, 120_000);

  it("refreshes palette suggestions from the just-typed value", async () => {
    const session = await bootedCockpit();

    session.key("ctrl-p");
    await session.waitForGridText("Search", 5_000);
    session.type("/t");

    // With the committed "/t" value, the first theme-adjacent match group is
    // visible immediately. A one-key-lagged palette still shows the empty-query
    // catalog here.
    await session.waitForGridText("/trajectories-compress", 5_000);

    session.type("h");
    await session.waitForGridTextAbsent("/trajectories-compress", 5_000);
    const grid = await session.gridText();
    expect(grid).toContain("/theme-list");
  }, 120_000);
});
