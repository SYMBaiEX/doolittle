import { expect, it } from "vitest";
import { destroyTerminalSession } from "../support/terminal-pty";
import {
  sleep,
  spawnWizardSession,
  type WizardSession,
} from "../support/wizard-pty";

async function destroyWizard(session: WizardSession): Promise<void> {
  await destroyTerminalSession(session.terminal, {
    profile: session.fixture.root,
    data: session.fixture.data,
    environment: session.fixture.environment,
    cleanup: session.fixture.cleanup,
  });
}

function expectOuterOverlayBorder(lines: string[], title: string): void {
  const marker = `┌─ ${title}`;
  const topRow = lines.findIndex((line) => line.includes(marker));
  expect(topRow).toBeGreaterThanOrEqual(0);
  const top = lines[topRow] ?? "";
  const left = top.indexOf(marker);
  const right = top.indexOf("┐", left);
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeGreaterThan(left);

  let bottomRow = -1;
  for (let row = topRow + 1; row < lines.length; row += 1) {
    const line = lines[row] ?? "";
    if (line.charAt(left) === "└" && line.charAt(right) === "┘") {
      bottomRow = row;
      break;
    }
  }
  expect(bottomRow).toBeGreaterThan(topRow);

  const missingRightBorderRows: number[] = [];
  for (let row = topRow + 1; row < bottomRow; row += 1) {
    if ((lines[row] ?? "").charAt(right) !== "│") {
      missingRightBorderRows.push(row);
    }
  }
  expect(missingRightBorderRows).toEqual([]);
}

it("replaces and input-locks overlays below the fullscreen minimum, then restores them", async () => {
  const wizard = spawnWizardSession({ cols: 120, rows: 32 });
  const session = wizard.terminal;
  try {
    await session.waitForGridText("Choose my first form", 10_000);
    session.key("enter");
    await session.waitForGridText("What should I answer to", 5_000);

    session.resize(82, 24);
    await session.waitForGridText("Terminal Too Small", 3_000);
    const tooSmallGrid = await session.gridText();
    expect(tooSmallGrid).toContain("Resize to at least 88×28");
    expect(tooSmallGrid).not.toContain("What should I answer to");
    expect(tooSmallGrid).not.toContain("Enter save · Esc keep current");

    // Input is intentionally swallowed while the replacement surface is up:
    // blind typing or Enter must not edit/submit the hidden text overlay.
    session.type("Z");
    session.key("enter");
    await sleep(250);

    session.resize(120, 32);
    await session.waitForGridText("What should I answer to", 3_000);
    const restoredGrid = await session.gridText();
    expect(restoredGrid).toContain("AuditBot");
    expect(restoredGrid).not.toContain("AuditBotZ");
    expect(restoredGrid).not.toContain("What timezone should shape my days");

    session.type("Z");
    await session.waitForGridText("AuditBotZ", 2_000);

    // The input lock swallows ordinary keys but must never swallow the
    // advertised global Ctrl-C abort while the replacement surface is up.
    session.resize(82, 24);
    await session.waitForGridText("Terminal Too Small", 3_000);
    session.key("ctrl-c");
    const exitCode = await Promise.race([
      session.closed,
      sleep(5_000).then(() => undefined),
    ]);
    expect(exitCode).toBe(1);
  } finally {
    await destroyWizard(wizard);
  }
}, 20_000);

it("keeps the outer overlay right border continuous at ordinary width", async () => {
  const wizard = spawnWizardSession({ cols: 110, rows: 30 });
  const session = wizard.terminal;
  try {
    await session.waitForGridText("Choose my first form", 10_000);
    expectOuterOverlayBorder(await session.gridLines(), "Choose One");
    session.key("enter");
    await session.waitForGridText("What should I answer to", 5_000);
    expectOuterOverlayBorder(await session.gridLines(), "Input");
  } finally {
    await destroyWizard(wizard);
  }
}, 20_000);

it("does not let theme preview replace prompt footer copy with unimplemented theme controls", async () => {
  const wizard = spawnWizardSession({ cols: 160, rows: 30 });
  const session = wizard.terminal;
  try {
    await session.waitForGridText("Choose my first form", 10_000);
    session.key("up");
    session.key("enter");
    await session.waitForGridText("What should I answer to", 5_000);
    session.key("enter");
    await session.waitForGridText("What timezone should shape my days", 5_000);
    session.key("enter");
    await session.waitForGridText("Choose the face I wake up in", 5_000);

    session.key("down");
    await session.waitForGridText("Theme: Blue Static", 2_000);
    const lines = await session.gridLines();
    const footer = lines.at(-1) ?? "";
    expect(footer).toContain("Enter or Space confirm");
    expect(footer).not.toContain("Theme preview");
    expect(footer).not.toContain("next theme");
    expect(footer).not.toContain("previous theme");
    expect(footer).not.toContain("cycle");
  } finally {
    await destroyWizard(wizard);
  }
}, 20_000);
