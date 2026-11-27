import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSession } from "../support/terminal-pty";
import { destroyTerminalSession } from "../support/terminal-pty";
import {
  createWizardFixture,
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

async function waitUntil(
  description: string,
  condition: () => Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise((done) => setTimeout(done, 50));
  }
}

interface RowCellScan {
  row: number;
  column: number;
}

function locateLabel(lines: string[], label: string): RowCellScan {
  // The highlighted label renders twice: once in the list row on the left
  // and once in the detail pane on the right. The list row is the leftmost
  // occurrence.
  let best: RowCellScan | undefined;
  for (let row = 0; row < lines.length; row += 1) {
    const column = (lines[row] ?? "").indexOf(label);
    if (column >= 0 && (best === undefined || column < best.column)) {
      best = { row, column: column + 1 };
    }
  }
  expect(best, `grid row containing ${label}`).toBeDefined();
  return best as RowCellScan;
}

describe("setup wizard theme contrast", () => {
  it("paints selection rows in the live-previewed theme primary", async () => {
    fixture = createWizardFixture();
    const session = spawnWizardSession({
      fixture,
      cols: 110,
      rows: 30,
    }).terminal;
    terminal = session;
    await session.waitForGridText("Choose my first form", BOOT_TIMEOUT_MS);
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

    // The default highlight is the orange theme. The selection row and the
    // header band both paint the theme primary, so their cell backgrounds
    // must agree exactly — whatever encoding the terminal negotiates.
    const scanRows = async () => session.gridLines();
    const initialLines = await scanRows();
    const orangeScan = locateLabel(initialLines, "Neon Dune (orange)");
    const headerBefore = await session.cellAt(4, 0);
    const selectedBefore = await session.cellAt(
      orangeScan.column,
      orangeScan.row,
    );
    expect(headerBefore?.bg).toBeDefined();
    expect(selectedBefore?.bg).toBe(headerBefore?.bg);
    // The foreground must differ from the background it sits on; a matching
    // pair would be invisible text regardless of encoding.
    expect(selectedBefore?.fg).not.toBe(selectedBefore?.bg);

    // Move the highlight to the blue theme: the live preview repaints the
    // header in blue's primary, and the selection row must follow rather
    // than staying orange.
    session.key("down");
    await waitUntil("the live preview to repaint the header", async () => {
      const header = await session.cellAt(4, 0);
      return header?.bg !== headerBefore?.bg;
    });
    const previewedLines = await scanRows();
    const blueScan = locateLabel(previewedLines, "Blue Static (blue)");
    const headerAfter = await session.cellAt(4, 0);
    const selectedAfter = await session.cellAt(blueScan.column, blueScan.row);
    expect(selectedAfter?.bg).toBe(headerAfter?.bg);
    expect(selectedAfter?.bg).not.toBe(selectedBefore?.bg);
    expect(selectedAfter?.fg).not.toBe(selectedAfter?.bg);
  }, 120_000);
});
