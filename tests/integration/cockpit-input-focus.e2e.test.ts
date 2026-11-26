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
const INPUT_ROW = ROWS - 3;
const BOOT_TIMEOUT_MS = 45_000;
const PAGE_UP = "\x1b[5~";
const PAGE_DOWN = "\x1b[6~";
const SHIFT_TAB = "\x1b[Z";

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

function bootCockpit(): TerminalSession {
  const session = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [sourceCliEntry, "--cli"],
    cols: COLS,
    rows: ROWS,
    cwd: fixture.profile,
    env: fixture.environment,
  });
  terminal = session;
  return session;
}

async function bootedCockpit(): Promise<TerminalSession> {
  const session = bootCockpit();
  await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
  await session.waitForGridText("queue:0", BOOT_TIMEOUT_MS);
  return session;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function countExactLine(text: string, expected: string): number {
  return text.split(/\r?\n/u).filter((line) => line.trim() === expected).length;
}

function conversationRegion(lines: string[]): string {
  // Rows inside the Conversation panel at the 160x30 acceptance geometry.
  return lines.slice(4, 19).join("\n");
}

describe("cockpit input ownership and focus lifecycle", () => {
  it("submits Enter exactly once and focuses the processing surface", async () => {
    const session = await bootedCockpit();

    session.type("!sleep 1");
    session.key("enter");

    await session.waitForGridText("processing", 10_000);
    // processQueue moves focus out of the input while the turn is active.
    await session.waitForGridText("scroll conversation", 10_000);
    await session.waitForGridText("run complete", 15_000);
    await session.waitForGridText("Enter send", 10_000);

    // Transcript persistence is coalesced; give the trailing write a bounded moment.
    await sleep(700);
    const transcript = readFileSync(
      resolve(fixture.data, "latest-transcript.txt"),
      "utf8",
    );
    expect(countExactLine(transcript, "!sleep 1")).toBe(1);
  }, 120_000);

  it("preserves a draft typed during a busy turn", async () => {
    const session = await bootedCockpit();

    session.type("!sleep 2");
    session.key("enter");
    await session.waitForGridText("processing", 10_000);
    await session.waitForGridText("scroll conversation", 10_000);

    // From Conversation: Status, Controls, then Input.
    session.key("tab");
    await session.waitForGridText("Enter sessions", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter top suggestion", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter send", 5_000);

    session.type("draftprobe");
    await sleep(250);
    const duringBusy = await session.gridLines();
    expect(duringBusy[INPUT_ROW]).toContain("draftprobe");

    await session.waitForGridText("run complete", 15_000);
    await session.waitForGridText("Enter send", 10_000);
    await sleep(250);
    const afterReady = await session.gridLines();
    expect(afterReady[INPUT_ROW]).toContain("draftprobe");
  }, 120_000);

  it("cycles pane focus with Tab and Shift-Tab, then scrolls Conversation", async () => {
    const session = await bootedCockpit();

    session.type("/help");
    session.key("enter");
    await session.waitForGridText("TerminalFixture operator shell", 15_000);
    await session.waitForGridText("Enter send", 10_000);

    session.key("tab");
    await session.waitForGridText("scroll ops log", 5_000);
    session.key("tab");
    await session.waitForGridText("scroll conversation", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter sessions", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter top suggestion", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter send", 5_000);

    session.type(SHIFT_TAB);
    await session.waitForGridText("Enter top suggestion", 5_000);
    session.key("tab");
    await session.waitForGridText("Enter send", 5_000);

    // Reach Conversation through traversal and verify PageUp/PageDown own that pane.
    session.key("tab");
    await session.waitForGridText("scroll ops log", 5_000);
    session.key("tab");
    await session.waitForGridText("scroll conversation", 5_000);

    session.type(PAGE_DOWN);
    await sleep(300);
    const afterPageDown = conversationRegion(await session.gridLines());
    session.type(PAGE_UP);
    await sleep(300);
    const afterPageUp = conversationRegion(await session.gridLines());
    expect(afterPageUp).not.toBe(afterPageDown);

    // Bare q is deliberately inert on pane surfaces; exit remains explicit.
    session.type(SHIFT_TAB);
    await session.waitForGridText("scroll ops log", 5_000);
    session.type("q");
    await sleep(300);
    expect(session.exitCode).toBeUndefined();
    expect(await session.gridText()).toContain("ready");
  }, 120_000);

  it("opens the cockpit composer with Ctrl-E instead of spawning vi", async () => {
    const session = await bootedCockpit();

    session.type("composerseed");
    session.key("ctrl-e");

    await session.waitForGridText("Multiline input", 5_000);
    await session.waitForGridText("Ctrl-S submit draft", 5_000);
    const grid = await session.gridText();
    expect(grid).toContain("composerseed");
    expect(grid).not.toContain("/tmp/");
    expect(grid).not.toContain("[New");
  }, 120_000);
});
