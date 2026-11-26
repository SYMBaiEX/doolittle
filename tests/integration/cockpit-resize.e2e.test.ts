import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builtCliEntry,
  createTerminalProfile,
  destroyTerminalSession,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

const BOOT_TIMEOUT_MS = 45_000;
const RESIZE_TIMEOUT_MS = 10_000;

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("cockpit resize acceptance", () => {
  it("replaces the cockpit below minimum size and restores it at the minimum", async () => {
    terminal = spawnTerminalSession({
      argv: [builtCliEntry, "--cli"],
      cols: 140,
      rows: 40,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    await terminal.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
    await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

    terminal.resize(60, 15);
    await terminal.waitForGridText(
      "Resize to at least 80x24",
      RESIZE_TIMEOUT_MS,
    );
    await terminal.waitForGridText("Current 60x15", RESIZE_TIMEOUT_MS);

    const smallLines = await terminal.gridLines();
    expect(smallLines).toHaveLength(15);
    const smallGrid = smallLines.join("\n");
    expect(countOccurrences(smallGrid, "Terminal too small")).toBe(1);
    expect(smallGrid).toContain("Resize to at least 80x24");
    expect(smallGrid).toContain("Current 60x15");
    for (const staleCockpitMarker of [
      "Conversation",
      "Ops Stream",
      "Input",
      "Doolittle is ready.",
      "queue:0",
    ]) {
      expect(smallGrid).not.toContain(staleCockpitMarker);
    }

    // A second below-minimum resize updates the dedicated surface instead of
    // recomputing the cockpit's live percentage geometry.
    terminal.resize(40, 10);
    await terminal.waitForGridText("Current 40x10", RESIZE_TIMEOUT_MS);
    const smallerGrid = await terminal.gridText();
    expect(countOccurrences(smallerGrid, "Terminal too small")).toBe(1);
    expect(smallerGrid).not.toContain("queue:0");

    terminal.resize(80, 24);
    await terminal.waitForGridText("Doolittle is ready.", RESIZE_TIMEOUT_MS);
    await terminal.waitForGridText("queue:0", RESIZE_TIMEOUT_MS);

    const restoredLines = await terminal.gridLines();
    expect(restoredLines).toHaveLength(24);
    const restoredGrid = restoredLines.join("\n");
    expect(restoredGrid).not.toContain("Terminal too small");
    expect(restoredGrid).not.toContain("Resize to at least 80x24");

    const footerRow = restoredLines.length - 1;
    const inputRow = restoredLines.findIndex((line) => line.includes("Input"));
    expect(inputRow).toBeGreaterThanOrEqual(0);
    expect(inputRow).toBeLessThan(footerRow);
    expect(restoredLines[footerRow]).toContain("queue:0");
    expect(restoredLines[footerRow]).not.toContain("Input");

    // Focus and readInput state survive the round trip: the primary input is
    // active again after the cockpit surface is restored. Do not submit at
    // exact-minimum height; the point is keystroke ownership, not command output.
    const focusProbe = "resize-focus-probe";
    terminal.type(focusProbe);
    await terminal.waitForGridText(focusProbe, 10_000);
    const typedLines = await terminal.gridLines();
    expect(typedLines[inputRow + 1]).toContain(focusProbe);
  }, 120_000);
});
