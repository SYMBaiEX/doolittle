import { readdirSync, statSync } from "node:fs";
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

function listFiles(root: string): string[] {
  const results: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else results.push(path.slice(root.length + 1));
    }
  };
  walk(root);
  return results.sort();
}

describe("setup wizard text input abort semantics", () => {
  it("exits cleanly when Ctrl-C is pressed inside a text input", async () => {
    const session = boot();
    await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);
    session.key("enter"); // either mode; both reach the name input
    await session.waitForGridText("What should I answer to", STEP_TIMEOUT_MS);

    // The footer explicitly advertises "Ctrl-C exits".
    expect(await session.gridText()).toContain("Control-C exits");
    session.key("ctrl-c");

    // The process must exit like every other wizard abort: code 1, no
    // settings/gateway/onboarding writes, terminal state restored.
    const code = await Promise.race([
      session.closed,
      sleep(8_000).then(() => undefined),
    ]);
    expect(code).toBe(1);

    if (!fixture) throw new Error("fixture missing");
    const writes = listFiles(fixture.root).filter(
      (rel) =>
        rel.endsWith("settings.json") ||
        rel.endsWith("onboarding.json") ||
        rel.endsWith("gateway.json"),
    );
    expect(writes).toEqual([]);

    // Alternate screen and mouse modes are released, cursor restored.
    expect(session.rawOutput).toContain("\x1b[?1049l");
    expect(session.rawOutput).toContain("\x1b[?25h");
  }, 120_000);

  it("keeps Escape as the cancel/keep-current path in text inputs", async () => {
    const session = boot();
    await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);
    session.key("enter");
    await session.waitForGridText("What should I answer to", STEP_TIMEOUT_MS);

    // Escape is not an exit: it keeps the current default and advances.
    session.key("escape");
    await sleep(400);
    expect(session.exitCode).toBeUndefined();
    await session.waitForGridText(
      "What timezone should shape my days",
      STEP_TIMEOUT_MS,
    );
  }, 120_000);
});
