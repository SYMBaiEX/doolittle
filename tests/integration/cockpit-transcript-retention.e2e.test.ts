import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// Round-17 transcript retention acceptance.
//
// The cockpit transcript used to window every rendering and every export to
// the last 24 entries (TRANSCRIPT_LIMIT), so after ~12 conversation turns the
// earliest messages were gone from disk and viewport alike — genuine data
// loss, since latest-transcript.txt is the durable record. This suite drives
// 26 real offline turns through the PTY and verifies:
//
//   1. the export file retains every message, first to last;
//   2. the viewport autoscrolls: the newest reply is visible without the
//      operator ever touching scroll keys.
//
// Turns are paced by the export file itself: the offline provider answer is
// constant, so counting its occurrences in latest-transcript.txt is a exact
// completion oracle (the trailing write always lands within the 500ms export
// coalescing window, long after the input box has been re-enabled).

const COLS = 110;
const ROWS = 30;
const BOOT_TIMEOUT_MS = 60_000;
const TURNS = 26;
const OFFLINE_RESPONSE_MARKER = "model provider is unavailable";
const MESSAGE_PREFIX = "scrollback probe";

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

function transcriptExportPath(): string {
  return join(fixture.data, "latest-transcript.txt");
}

function readExport(): string {
  const path = transcriptExportPath();
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function countOccurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

async function waitForCompletedReplies(count: number, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const completions = countOccurrences(readExport(), OFFLINE_RESPONSE_MARKER);
    if (completions >= count) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Only ${completions}/${count} offline replies reached the transcript export in time.`,
      );
    }
    await new Promise((done) => setTimeout(done, 100));
  }
}

async function submitAndAwaitTurn(message: string, turn: number) {
  if (!terminal) throw new Error("terminal not started");
  terminal.type(message);
  terminal.key("enter");
  await waitForCompletedReplies(turn);
}

describe("cockpit transcript retention acceptance", () => {
  it("keeps every message in the export and autoscrolls the viewport to the newest reply", async () => {
    terminal = spawnTerminalSession({
      command: resolveNubExecutable(),
      argv: [sourceCliEntry, "--cli"],
      cols: COLS,
      rows: ROWS,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    await terminal.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);

    for (let turn = 1; turn <= TURNS; turn += 1) {
      const padded = String(turn).padStart(2, "0");
      await submitAndAwaitTurn(`${MESSAGE_PREFIX} ${padded}`, turn);
    }

    // 1. Export completeness: all 26 user echoes survived — before the fix the
    //    file was windowed to the last 24 entries (~12 turns), so the earliest
    //    probes simply were not on disk.
    const exported = readExport();
    for (let turn = 1; turn <= TURNS; turn += 1) {
      const padded = String(turn).padStart(2, "0");
      expect(exported).toContain(`${MESSAGE_PREFIX} ${padded}`);
    }
    expect(countOccurrences(exported, MESSAGE_PREFIX)).toBe(TURNS);
    expect(countOccurrences(exported, OFFLINE_RESPONSE_MARKER)).toBe(TURNS);

    // 2. Autoscroll: the operator never scrolled, so the viewport follows the
    //    tail — the final echo and its reply are on screen…
    const viewport = await terminal.gridText();
    expect(viewport).toContain(`${MESSAGE_PREFIX} ${TURNS}`);
    expect(viewport).toContain(OFFLINE_RESPONSE_MARKER);
    // …and the earliest probes scrolled out of the conversation panel (the
    // transcript is far taller than the 15-row viewport after 26 turns). The
    // negative assertion is scoped to the conversation columns: the Status
    // sidebar legitimately repeats the session title, which derives from the
    // first message.
    const conversationViewport = (await terminal.gridLines())
      .slice(3, 19)
      .map((line) => line.slice(0, 85))
      .join("\n");
    expect(conversationViewport).not.toContain(`${MESSAGE_PREFIX} 01`);
    expect(conversationViewport).not.toContain(`${MESSAGE_PREFIX} 05`);
  }, 300_000);
});
