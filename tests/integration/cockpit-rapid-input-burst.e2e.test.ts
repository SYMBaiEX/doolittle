import { existsSync, readFileSync } from "node:fs";
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

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function bootedCockpit(): Promise<TerminalSession> {
  const session = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [sourceCliEntry, "--cli"],
    cols: 160,
    rows: 30,
    cwd: fixture.profile,
    env: fixture.environment,
  });
  terminal = session;
  await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
  // Behavioral focus probe: prove the input owns keystrokes before the burst.
  session.type("zzfocusprobe");
  await session.waitForGridText("zzfocusprobe", BOOT_TIMEOUT_MS);
  for (let i = 0; i < "zzfocusprobe".length; i += 1) session.key("backspace");
  await session.waitForGridTextAbsent("zzfocusprobe", BOOT_TIMEOUT_MS);
  return session;
}

async function readTranscriptWhenWritten(expected: string[]): Promise<string> {
  const transcriptPath = resolve(fixture.data, "latest-transcript.txt");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(transcriptPath)) {
      const transcript = readFileSync(transcriptPath, "utf8");
      if (expected.every((needle) => transcript.includes(needle))) {
        return transcript;
      }
    }
    await sleep(200);
  }
  return existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : "";
}

describe("cockpit rapid-input bursts", () => {
  it("preserves every command typed in a fast back-to-back burst", async () => {
    const session = await bootedCockpit();

    // One write carries the entire burst as immediate keystrokes, the way a
    // fast typist (or paste) submits follow-up commands before the first turn
    // has even begun. Turn startup moves focus to the processing surface; the
    // follow-up commands must still reach the queue instead of landing in the
    // void.
    session.type("!sleep 2\r/help\r/commands search theme\r");

    const transcript = await readTranscriptWhenWritten([
      "!sleep 2",
      "/help",
      "/commands search theme",
    ]);
    expect(transcript).toContain("!sleep 2");
    expect(transcript).toContain("/help");
    expect(transcript).toContain("/commands search theme");

    // Queue ordering must match submission order.
    const sleepIndex = transcript.indexOf("!sleep 2");
    const helpIndex = transcript.indexOf("/help");
    const searchIndex = transcript.indexOf("/commands search theme");
    expect(sleepIndex).toBeGreaterThanOrEqual(0);
    expect(helpIndex).toBeGreaterThan(sleepIndex);
    expect(searchIndex).toBeGreaterThan(helpIndex);
  }, 120_000);

  it("preserves commands typed by a fast human while a turn is busy", async () => {
    const session = await bootedCockpit();

    session.type("!sleep 3");
    session.key("enter");
    await session.waitForGridText("processing", 10_000);

    // Human-paced but fast follow-up: keystrokes arrive one event-loop turn
    // apart while the first turn still owns the processing surface.
    for (const ch of "!echo burst-second") {
      session.type(ch);
      await sleep(15);
    }
    session.key("enter");

    const transcript = await readTranscriptWhenWritten([
      "!sleep 3",
      "!echo burst-second",
    ]);
    expect(transcript).toContain("!echo burst-second");
    const sleepIndex = transcript.indexOf("!sleep 3");
    const echoIndex = transcript.indexOf("!echo burst-second");
    expect(sleepIndex).toBeGreaterThanOrEqual(0);
    expect(echoIndex).toBeGreaterThan(sleepIndex);
  }, 120_000);
});
