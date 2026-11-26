import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSession } from "../support/terminal-pty";
import { destroyTerminalSession } from "../support/terminal-pty";
import {
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

/** Drive the ritual path through identity/provider/cadence/body to channels. */
async function reachChannelsPrompt(session: TerminalSession): Promise<void> {
  await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);
  session.key("enter"); // Full awakening (ritual) is the default highlight
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
  await session.waitForGridText("Where should I execute", STEP_TIMEOUT_MS);
  session.key("enter");
  await session.waitForGridText("Choose my eyes", STEP_TIMEOUT_MS);
  session.key("enter");
  await session.waitForGridText("Open these channels for me", STEP_TIMEOUT_MS);
}

describe("setup wizard choose-many cursor movement", () => {
  it("moves the cursor with Down instead of crashing the wizard", async () => {
    const session = boot();
    await reachChannelsPrompt(session);

    session.key("down");
    // The reentrancy crash does not surface synchronously: the recursion is
    // fed by repaint ticks and the RangeError/exit typically lands 1-2s after
    // the keypress. Wait well past that window before judging survival.
    await sleep(2_800);

    // The wizard must survive ordinary cursor movement: still running, still
    // showing the channels overlay, and no blessed recursion crash.
    expect(session.exitCode).toBeUndefined();
    expect(session.rawOutput).not.toContain(
      "RangeError: Maximum call stack size exceeded",
    );
    expect(await session.gridText()).toContain("Open these channels for me");

    // The cursor really moved: toggling now selects Discord (the second row),
    // not Telegram (the first).
    session.type(" ");
    await sleep(400);
    const grid = await session.gridText();
    expect(grid).toContain("● Discord");
    expect(grid).not.toContain("● Telegram");
  }, 120_000);

  it("keeps cursor position stable across repaints and confirms the toggled values", async () => {
    const session = boot();
    await reachChannelsPrompt(session);

    // Move down twice, toggle the third row (Slack), then confirm with Enter.
    // The crash window after a move is 1-2s, so a survivor must still be
    // healthy after a longer settle.
    session.key("down");
    await sleep(1_200);
    session.key("down");
    await sleep(1_200);
    expect(session.exitCode).toBeUndefined();
    session.type(" ");
    await sleep(300);
    const grid = await session.gridText();
    expect(grid).toContain("● Slack");

    session.key("enter");
    // The ritual continues to the pairing prompt instead of dying.
    await session.waitForGridText(
      "How should I greet new arrivals",
      STEP_TIMEOUT_MS,
    );
    expect(session.exitCode).toBeUndefined();
  }, 120_000);
});
