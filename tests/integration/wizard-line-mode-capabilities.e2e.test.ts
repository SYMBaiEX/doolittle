import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSession } from "../support/terminal-pty";
import { destroyTerminalSession } from "../support/terminal-pty";
import {
  createWizardFixture,
  spawnWizardSession,
  type WizardFixture,
} from "../support/wizard-pty";

const BOOT_TIMEOUT_MS = 30_000;
// The orange truecolor escape the banner and section titles paint with.
const ORANGE_TRUECOLOR = "38;2;255;106;0";

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

function bootLineWizard(environment: NodeJS.ProcessEnv): TerminalSession {
  fixture = createWizardFixture();
  // 80x24 is below the fullscreen minimum, so the wizard takes the line
  // fallback — the surface this journey exercises.
  const session = spawnWizardSession({
    fixture,
    cols: 80,
    rows: 24,
    environment,
  });
  terminal = session.terminal;
  return session.terminal;
}

describe("setup wizard line-mode terminal capabilities", () => {
  it("emits no color bytes when NO_COLOR is set", async () => {
    const session = bootLineWizard({ NO_COLOR: "1" });
    await session.waitForRaw("AWAKENING", BOOT_TIMEOUT_MS);
    await session.waitForRaw("Choose my first form", BOOT_TIMEOUT_MS);
    // Cursor-movement control sequences are fine — NO_COLOR governs color
    // only — but no SGR color sequence may appear anywhere. Every painted
    // segment ends with the reset tone, so its absence proves nothing was
    // painted at all.
    expect(session.rawOutput).not.toContain(ORANGE_TRUECOLOR);
    expect(session.rawOutput).not.toContain("\u001b[0m");
    expect(session.rawOutput).not.toContain("\u001b[36m");
    expect(session.rawOutput).toContain("AWAKENING");
  }, 60_000);

  it("paints color on a plain TTY without NO_COLOR", async () => {
    const session = bootLineWizard({});
    await session.waitForRaw("Choose my first form", BOOT_TIMEOUT_MS);
    expect(session.rawOutput).toContain(ORANGE_TRUECOLOR);
  }, 60_000);
});
