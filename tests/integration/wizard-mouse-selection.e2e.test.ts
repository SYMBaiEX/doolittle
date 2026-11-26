import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSession } from "../support/terminal-pty";
import { destroyTerminalSession } from "../support/terminal-pty";
import {
  clickTerminal,
  createWizardFixture,
  sleep,
  spawnWizardSession,
  type WizardFixture,
} from "../support/wizard-pty";

const BOOT_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 15_000;

let fixture: WizardFixture | undefined;
let terminal: TerminalSession | undefined;

afterEach(async () => {
  if (terminal && fixture) {
    await destroyTerminalSession(terminal, {
      profile: fixture.root,
      data: fixture.data,
      environment: fixture.environment,
      cleanup: fixture.cleanup,
    });
  } else {
    fixture?.cleanup();
  }
  terminal = undefined;
  fixture = undefined;
});

function boot(): TerminalSession {
  fixture = createWizardFixture();
  const session = spawnWizardSession({ fixture, cols: 110, rows: 30 });
  terminal = session.terminal;
  return session.terminal;
}

describe("setup wizard mouse selection semantics", () => {
  it("syncs the semantic selection when a click moves the highlight", async () => {
    const session = boot();
    await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);

    // Quick ignition's row: one-based terminal row 13 in the 110x30 layout.
    await clickTerminal(session, 30, 13);
    await sleep(250);

    // The detail pane must follow the clicked highlight, not the stale
    // private index that still points at Full awakening.
    const grid = await session.gridText();
    expect(grid).toContain("Wake me quickly");

    // Confirming must honor the clicked value: quick mode skips the
    // ritual-only execution-backend prompt entirely.
    session.key("enter");
    await session.waitForGridText("What should I answer to", STEP_TIMEOUT_MS);
    session.key("enter");
    await session.waitForGridText(
      "What timezone should shape my days",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "Choose the face I wake up in",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "How should I think on day one",
      STEP_TIMEOUT_MS,
    );
    session.type("8"); // Dormant core — offline provider path
    session.key("enter");
    await session.waitForGridText(
      "How far should I run before I stop",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "How much tool activity should I show",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");

    // Quick mode goes straight to the review confirmation. If the click was
    // ignored, the ritual-only backend prompt appears instead.
    await session.waitForGridText(
      "Should I seal this configuration",
      STEP_TIMEOUT_MS,
    );
    expect(await session.gridText()).not.toContain("Where should I execute");
  }, 120_000);

  it("syncs confirm overlay clicks so Enter confirms the clicked answer", async () => {
    const session = boot();
    await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);
    session.key("up"); // Quick ignition
    session.key("enter");
    await session.waitForGridText("What should I answer to", STEP_TIMEOUT_MS);
    session.key("enter");
    await session.waitForGridText(
      "What timezone should shape my days",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "Choose the face I wake up in",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "How should I think on day one",
      STEP_TIMEOUT_MS,
    );
    session.type("8"); // Dormant core
    session.key("enter");
    await session.waitForGridText(
      "How far should I run before I stop",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "How much tool activity should I show",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    await session.waitForGridText(
      "Should I seal this configuration",
      STEP_TIMEOUT_MS,
    );

    // The Yes/No list rows sit inside the confirm overlay. Find the "Yes"
    // row on the rendered grid; "No" is the row directly beneath it.
    const lines = await session.gridLines();
    const yesRowIndex = lines.findIndex((line) =>
      line.includes("Yes (default)"),
    );
    expect(yesRowIndex).toBeGreaterThan(-1);
    expect(lines[yesRowIndex + 1]).toContain("No");
    // xterm rows are one-based; the No row is one below the Yes row.
    await clickTerminal(session, 30, yesRowIndex + 2);
    await sleep(250);

    session.key("enter");

    // Clicking No means "do not write": the wizard loops back to the first
    // form instead of sealing the configuration and exiting successfully.
    await session.waitForGridText("Choose my first form", STEP_TIMEOUT_MS);
    expect(session.exitCode).toBeUndefined();
  }, 120_000);
});
