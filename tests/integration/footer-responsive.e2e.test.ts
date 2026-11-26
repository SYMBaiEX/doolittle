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
// The cockpit refuses terminals below 80 columns. The responsive footer
// contract keeps a complete quit affordance (`Ctrl-Q quit` or compact `^Q
// quit`) visible at every supported width; it never hard-clips that binding.
const MIN_SUPPORTED_COLS = 80;

const widthCases = [
  {
    cols: 80,
    rows: 24,
    expectedFooter:
      ".:: TerminalFixture | (^_) ready | queue:0 | offline | ^P commands | ^Q quit",
  },
  {
    cols: 110,
    rows: 30,
    expectedFooter:
      ".:: TerminalFixture | (^_) ready | queue:0 | offline | Ctrl-P commands | Enter send  ↑/↓ history | Ctrl-Q quit",
  },
  {
    cols: 140,
    rows: 40,
    expectedFooter:
      ".:: TerminalFixture  |  (^_) ready  |  queue:0  |  offline  |  Ctrl-P commands  |  Enter send  ↑/↓ history  |  Ctrl-Q quit",
  },
] as const;

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

describe("responsive cockpit footer", () => {
  it.each(widthCases)(
    "keeps complete priority segments in the footer at $cols x $rows",
    async ({ cols, rows, expectedFooter }) => {
      expect(cols).toBeGreaterThanOrEqual(MIN_SUPPORTED_COLS);
      terminal = spawnTerminalSession({
        command: resolveNubExecutable(),
        argv: [sourceCliEntry, "--cli"],
        cols,
        rows,
        cwd: fixture.profile,
        env: fixture.environment,
      });

      await terminal.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
      await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

      // The footer hint is focus-dependent: "Enter send" only renders once
      // the input box actually owns focus, and boot-time focus activation
      // races rendering on slow hosts (CI). Probe focus behaviorally — a
      // distinctive string must land in the input box — then remove it.
      terminal.type("zzfocusprobe");
      await terminal.waitForGridText("zzfocusprobe", BOOT_TIMEOUT_MS);
      for (let i = 0; i < "zzfocusprobe".length; i += 1) {
        terminal.key("backspace");
      }
      await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

      const lines = await terminal.gridLines();
      const footer = lines[rows - 1];

      // Essential operator state survives every width.
      for (const token of ["TerminalFixture", "ready", "queue:0", "offline"]) {
        expect(footer).toContain(token);
      }

      // Exact fixture rows are deliberate: every visible segment is complete,
      // compaction is explicit (^P/^Q), and no token is clipped by blessed.
      expect(footer).toBe(expectedFooter);
      expect(footer.length).toBeLessThanOrEqual(cols);
      expect(footer).toMatch(/(?:Ctrl-Q|\^Q) quit/u);
      expect(footer.endsWith("|")).toBe(false);
    },
    75_000,
  );
});
