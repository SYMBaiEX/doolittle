import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("setup wizard select-one escape semantics", () => {
  it("keeps the original value on Escape instead of committing the highlight", async () => {
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
    // Orange / Neon Dune is the default face. Arrow down once: the live
    // preview shifts the chrome to Blue Static.
    expect(await session.gridText()).toContain("Theme: Neon Dune");
    session.key("down");
    await sleep(400);
    expect(await session.gridText()).toContain("Theme: Blue Static");

    // The footer advertises "Esc keep current": current is the original
    // default, not the previewed highlight.
    session.key("escape");
    await sleep(400);

    // The preview must roll back too: the chrome may not stay committed to
    // the theme the user just discarded.
    expect(await session.gridText()).toContain("Theme: Neon Dune");

    // Complete the offline quick setup and inspect what was written.
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
    await session.waitForGridText(
      "Should I seal this configuration",
      STEP_TIMEOUT_MS,
    );
    session.key("enter");
    const code = await Promise.race([
      session.closed,
      sleep(10_000).then(() => undefined),
    ]);
    expect(code).toBe(0);

    if (!fixture) throw new Error("fixture missing");
    const onboardingPath = join(fixture.data, "onboarding.json");
    expect(existsSync(onboardingPath)).toBe(true);
    const onboarding = JSON.parse(readFileSync(onboardingPath, "utf8"));
    expect(onboarding.theme).toBe("orange");
  }, 120_000);
});
