import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTerminalProfile,
  destroyTerminalSession,
  resolveNubExecutable,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

const COLS = 160;
const ROWS = 30;
const BOOT_TIMEOUT_MS = 45_000;

const MARKER_JOINED = "ZxQvSplitHead-mid-ZxQvSplitTail";
const fixtureEntry = fileURLToPath(
  new URL("../fixtures/cockpit-foreign-output-entry.ts", import.meta.url),
);

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

function triggerPath(): string {
  return resolve(fixture.profile, "foreign-writes-enabled");
}

function bootedCockpit(): Promise<TerminalSession> {
  const session = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [fixtureEntry, "--cli"],
    cols: COLS,
    rows: ROWS,
    cwd: fixture.profile,
    env: {
      ...fixture.environment,
      DOOLITTLE_FOREIGN_TRIGGER: triggerPath(),
    },
  });
  terminal = session;
  return session;
}

function enableForeignWrites(): void {
  writeFileSync(triggerPath(), "go\n");
}

function highestGeneration(lines: string[]): number {
  let highest = 0;
  for (const line of lines) {
    for (const match of line.matchAll(/ZxQvSplitTail-G(\d+)/gu)) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return highest;
}

function expectNoShreddedFragments(lines: string[]): void {
  for (const line of lines) {
    if (line.includes("ZxQvSplit")) {
      expect(
        line.includes(MARKER_JOINED),
        `shredded foreign output line: ${JSON.stringify(line)}`,
      ).toBe(true);
    }
    if (line.includes("-mid-")) {
      expect(
        line.includes("ZxQvSplitHead-mid-"),
        `orphaned mid fragment line: ${JSON.stringify(line)}`,
      ).toBe(true);
    }
  }
}

describe("cockpit foreign output routing", () => {
  it("reassembles split writes into complete Ops Stream lines once focus leaves the input", async () => {
    const session = await bootedCockpit();
    await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
    await session.waitForGridText("Enter send", BOOT_TIMEOUT_MS);

    // Writes begin only once the cockpit is fully booted and the input
    // holds focus, so every marker exercises live TUI routing.
    enableForeignWrites();

    // While the input holds focus, foreign output stays deferred rather
    // than streaming through the cockpit chrome mid-keystroke.
    await sleep(1_600);
    const whileFocused = await session.gridLines();
    expect(
      whileFocused.some((line) => line.includes("ZxQvSplit")),
      `foreign output should defer while input focused:\n${whileFocused.join("\n")}`,
    ).toBe(false);

    // Tab moves focus to a non-entry pane; the backlog must flush without
    // any further user action.
    session.key("tab");
    await session.waitForGridText(MARKER_JOINED, 10_000);

    // No shredded fragments: every line mentioning the marker must carry
    // the complete reassembled write, never a partial chunk.
    const lines = await session.gridLines();
    expect(
      lines.some((line) => line.includes(MARKER_JOINED)),
      "complete marker line visible in Ops Stream",
    ).toBe(true);
    expectNoShreddedFragments(lines);
  }, 120_000);

  it("pauses routing when focus returns to the input and resumes when it leaves again", async () => {
    const session = await bootedCockpit();
    await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
    enableForeignWrites();

    // Move focus off the input and let live traffic stream.
    session.key("tab");
    await session.waitForGridText(MARKER_JOINED, 10_000);

    // Return focus to the input; fresh generations must stop appearing
    // because routing defers again.
    session.key("escape");
    await session.waitForGridText("Enter send", 10_000);
    // Let the viewport settle, then sample the highest visible generation.
    await sleep(700);
    const frozenSample = await session.gridLines();
    const frozenGeneration = highestGeneration(frozenSample);
    await sleep(1_600);
    const afterWait = await session.gridLines();
    expect(highestGeneration(afterWait)).toBe(frozenGeneration);

    // Tab back out: the deferred generations flush and live traffic resumes.
    session.key("tab");
    await sleep(1_800);
    const resumed = await session.gridLines();
    expect(highestGeneration(resumed)).toBeGreaterThan(frozenGeneration);
    expectNoShreddedFragments(resumed);
  }, 120_000);
});
