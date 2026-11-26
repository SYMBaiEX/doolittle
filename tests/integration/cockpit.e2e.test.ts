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

// Round-1 cockpit audit template.
//
// LANE NOTE: this test boots the cockpit from the TypeScript source
// entrypoint through nub, not from apps/cli/dist. The bundled artifact
// currently cannot start the cockpit at all: esbuild's glob-require shim for
// blessed's `require("./widgets/" + name)` keys modules with their ".js"
// extension while blessed requires extensionless paths, so the first widget
// load throws "Module not found in bundle: ./widgets/node" and the CLI
// silently falls back to the plain shell. That is a product/build bug
// reported separately — once fixed, flip this spawn to the built entrypoint
// (see tests/integration/cli.e2e.test.ts) and keep every assertion unchanged.
const COLS = 110;
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

/** Inclusive row range as a single string for region-scoped assertions. */
function region(lines: string[], from: number, to: number): string {
  return lines.slice(from, to + 1).join("\n");
}

function columnOf(lines: string[], text: string): number {
  for (const line of lines) {
    const column = line.indexOf(text);
    if (column >= 0) return column;
  }
  return -1;
}

describe("cockpit boot acceptance", () => {
  it("renders the cockpit chrome into expected grid regions at 110x30", async () => {
    terminal = spawnTerminalSession({
      command: resolveNubExecutable(),
      argv: [sourceCliEntry, "--cli"],
      cols: COLS,
      rows: ROWS,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    // Stable-state anchor: the boot sequence completes when the welcome body
    // lands in the Conversation panel (runTuiBootSequence pushes it after the
    // activity entries, before the final render).
    await terminal.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
    // Give the deferred footer/layout passes a bounded moment, then assert on
    // the settled grid rather than the first rendered frame.
    await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

    const lines = await terminal.gridLines();
    expect(lines).toHaveLength(ROWS);

    // No silent fallback to the plain shell: the cockpit really booted.
    const grid = lines.join("\n");
    expect(grid).not.toContain("TUI failed to start");
    expect(grid).not.toContain("Falling back to plain CLI");
    expect(grid).not.toContain("Talk naturally for paired work");

    // Header band (rows 0-2): agent name, shell glyph copy, cockpit tagline.
    const header = region(lines, 0, 2);
    expect(header).toContain("TerminalFixture");
    expect(header).toContain("conversation shell");
    expect(header).toContain("cockpit for observability");

    // Panel chrome: the bordered labels blessed draws on each box. The
    // Conversation label opens the left pane; Status is the right sidebar.
    expect(lines[3]).toContain("Conversation");
    expect(grid).toContain("Ops Stream");
    expect(grid).toContain("Input");

    // Regional placement: at 110 columns the sidebar occupies the right edge
    // (left = 86% => column ~94); conversation content stays left of it.
    const sidebarColumn = columnOf(lines, "Status");
    expect(sidebarColumn).toBeGreaterThanOrEqual(88);
    const welcomeRow = lines.findIndex((line) =>
      line.includes("Doolittle is ready."),
    );
    expect(welcomeRow).toBeGreaterThanOrEqual(4);
    expect(welcomeRow).toBeLessThan(ROWS - 6);
    expect(lines[welcomeRow].indexOf("Doolittle is ready.")).toBeLessThan(88);

    // Sidebar content: the operator snapshot renders inside the Status pane.
    expect(grid).toContain("Operator");
    expect(grid).toContain("Snapshot");

    // Input box is the bottom-most bordered panel, above the footer row.
    const inputRow = lines.findIndex((line) => line.includes("Input"));
    expect(inputRow).toBeGreaterThanOrEqual(ROWS - 5);

    // Footer (last row): status hint strip with readiness, queue and mode.
    const footer = lines[ROWS - 1];
    expect(footer).toContain("TerminalFixture");
    expect(footer).toContain("ready");
    expect(footer).toContain("queue:0");
    expect(footer).toContain("offline");

    // Interaction smoke: real keystrokes reach the input box and Enter
    // submits — the response lands in the Conversation panel. This is
    // the round-2 template for driving the cockpit through the harness.
    terminal.type("/help");
    terminal.key("enter");
    // The /help body is far taller than the viewport. Because the transcript
    // pins to the bottom while the operator has never scrolled, correctness
    // is the END of the response being visible — not the echo header, which
    // scrolls above the fold exactly like in any chat client. "doolittle
    // jobs list" is the final line of the help Examples section.
    await terminal.waitForGridText("doolittle jobs list", 15_000);
    const afterSubmit = await terminal.gridText();
    expect(afterSubmit).toContain("/accounts connect codex");
    expect(afterSubmit).toContain("!git status");

    // NOTE: no clean operator exit path is asserted here. C-c keystrokes do
    // not terminate the cockpit (the screen-level binding never fires once
    // the input box owns keypresses), C-q is swallowed by PTY flow control
    // (ixon), and typing "exit" submits as conversational input rather than
    // closing. Reported as a product finding; teardown kills the PTY.
  }, 120_000);
});
