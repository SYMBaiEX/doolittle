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

// Round-16 layout regression acceptance: exact cockpit grid geometry at the
// four audit terminal sizes. The layout partitions rows/cols with absolute
// integer arithmetic (see apps/cli/src/cli/tui-layout.ts), so the boundary
// rows and columns asserted here are deterministic:
//
//   rows 0-2     header chrome
//   rows 3..H-5  panel region (exactly H-7 rows, partitioned without gaps)
//   rows H-4..H-2 input chrome (height 3, bottom-anchored 1 above footer)
//   row  H-1     footer strip
//
// Every visible booted panel must have inner rows (height >= 3), no two
// panels may share a row or column, and the clamped right rail must reach the
// terminal's last column. At narrow minimum height the collapsed Ops Stream
// uses progressive disclosure rather than rendering as a chrome-only strip.

const BOOT_TIMEOUT_MS = 60_000;

interface SizeExpectation {
  cols: number;
  rows: number;
  /** Inclusive border rows for each panel, as rendered. */
  response: [number, number];
  /** Undefined when progressive disclosure hides the collapsed ops panel. */
  activity?: [number, number];
  sidebar: [number, number];
  commands: [number, number];
  /** First column of the right rail; undefined for the narrow single column. */
  railLeft?: number;
}

// Shares derive from distributeRowShares() over H-7 rows; see tui-layout.ts.
const EXPECTATIONS: SizeExpectation[] = [
  {
    // Narrow minimum geometry: collapsed ops is progressively disclosed so
    // the three visible panels retain useful inner rows.
    cols: 80,
    rows: 24,
    response: [3, 9],
    sidebar: [10, 13],
    commands: [14, 19],
  },
  {
    cols: 110,
    rows: 30,
    response: [3, 19],
    activity: [20, 25],
    sidebar: [3, 14],
    commands: [15, 25],
    railLeft: 80,
  },
  {
    cols: 140,
    rows: 40,
    response: [3, 27],
    activity: [28, 35],
    sidebar: [3, 19],
    commands: [20, 35],
    railLeft: 107,
  },
  {
    cols: 200,
    rows: 50,
    response: [3, 35],
    activity: [36, 45],
    sidebar: [3, 24],
    commands: [25, 45],
    railLeft: 158,
  },
];

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

async function cellChars(column: number, row: number): Promise<string> {
  const cell = await terminal?.cellAt(column, row);
  return cell?.chars ?? "";
}

async function expectBorderRow(
  row: number,
  leftCol: number,
  rightCol: number,
  corners: [string, string],
): Promise<void> {
  expect(await cellChars(leftCol, row)).toBe(corners[0]);
  expect(await cellChars(rightCol, row)).toBe(corners[1]);
  expect(await cellChars(leftCol + 1, row)).toBe("─");
  expect(await cellChars(rightCol - 1, row)).toBe("─");
}

describe("cockpit layout geometry", () => {
  for (const expectation of EXPECTATIONS) {
    it(`partitions panels without overlap or dead space at ${expectation.cols}x${expectation.rows}`, async () => {
      terminal = spawnTerminalSession({
        command: resolveNubExecutable(),
        argv: [sourceCliEntry, "--cli"],
        cols: expectation.cols,
        rows: expectation.rows,
        cwd: fixture.profile,
        env: fixture.environment,
      });
      await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

      const lines = await terminal.gridLines();
      expect(lines).toHaveLength(expectation.rows);
      const grid = lines.join("\n");
      expect(grid).not.toContain("TUI failed to start");

      const narrow = expectation.railLeft === undefined;
      const rightEdge = expectation.cols - 1;
      const responseRight = narrow
        ? rightEdge
        : (expectation.railLeft as number) - 1;
      const inputTopRow = expectation.rows - 4;

      // Conversation: exact border rows, full width of its column.
      await expectBorderRow(expectation.response[0], 0, responseRight, [
        "┌",
        "┐",
      ]);
      await expectBorderRow(expectation.response[1], 0, responseRight, [
        "└",
        "┘",
      ]);

      // Ops Stream: exact border rows when disclosed. At the narrow minimum
      // its collapsed state is intentionally hidden instead of spending rows
      // on a chrome-only strip.
      if (expectation.activity) {
        const activityInnerRows =
          expectation.activity[1] - expectation.activity[0] - 1;
        expect(activityInnerRows).toBeGreaterThanOrEqual(1);
        await expectBorderRow(expectation.activity[0], 0, responseRight, [
          "┌",
          "┐",
        ]);
        await expectBorderRow(expectation.activity[1], 0, responseRight, [
          "└",
          "┘",
        ]);
      }

      // Status and Commands: exact rows. In the two-column layouts they
      // occupy the right rail; in the narrow layout they stack full-width.
      const railLeft = narrow ? 0 : (expectation.railLeft as number);
      const innerRows = (range: [number, number]) => range[1] - range[0] - 1;
      expect(innerRows(expectation.sidebar)).toBeGreaterThanOrEqual(1);
      expect(innerRows(expectation.commands)).toBeGreaterThanOrEqual(1);
      await expectBorderRow(expectation.sidebar[0], railLeft, rightEdge, [
        "┌",
        "┐",
      ]);
      await expectBorderRow(expectation.sidebar[1], railLeft, rightEdge, [
        "└",
        "┘",
      ]);
      await expectBorderRow(expectation.commands[0], railLeft, rightEdge, [
        "┌",
        "┐",
      ]);
      await expectBorderRow(expectation.commands[1], railLeft, rightEdge, [
        "└",
        "┘",
      ]);

      // Non-overlap: Status ends strictly above the Commands top border,
      // and the Commands bottom border sits strictly above the Input top
      // border (the shared-row collision at 110x30).
      expect(expectation.sidebar[1]).toBeLessThan(expectation.commands[0]);
      expect(expectation.commands[1]).toBeLessThan(inputTopRow);

      // Adjacency: the partition leaves no dead rows — each panel's top
      // border directly follows the previous panel's bottom border, and
      // the last panel ends on the row directly above the input chrome.
      if (narrow) {
        // With collapsed ops hidden, Status directly follows Conversation.
        expect(expectation.sidebar[0]).toBe(expectation.response[1] + 1);
        expect(expectation.commands[0]).toBe(expectation.sidebar[1] + 1);
      } else {
        if (!expectation.activity) {
          throw new Error("two-column expectations must include ops geometry");
        }
        expect(expectation.activity[0]).toBe(expectation.response[1] + 1);
        expect(expectation.commands[0]).toBe(expectation.sidebar[1] + 1);
        // In the two-column layouts the left column's last panel is the
        // Ops Stream.
        expect(expectation.activity[1]).toBe(inputTopRow - 1);
      }
      expect(expectation.commands[1]).toBe(inputTopRow - 1);

      // Input chrome: top border exactly where the fixed geometry puts it.
      await expectBorderRow(inputTopRow, 0, rightEdge, ["┌", "┐"]);

      // Core primary panels are present at every geometry. Ops Stream is
      // visible in two-column geometry and intentionally folded away only in
      // the narrow minimum collapsed state.
      expect(grid).toContain("Conversation");
      if (expectation.activity) {
        expect(grid).toContain("Ops Stream");
      } else {
        expect(grid).not.toContain("Ops Stream");
      }
      expect(grid).toContain("Status");
      expect(grid).toContain("Commands");

      // The dead hidden Transports/Execution panels are removed entirely —
      // their labels never render, and no phantom band is reserved for them
      // (the exact adjacency assertions above prove the rail is fully
      // partitioned between Status and Commands).
      expect(grid).not.toContain("Transports");
      expect(grid).not.toContain("Execution");

      // Right edge: the rail border occupies the terminal's last column —
      // no dead strip (cellAt reads exact cells, so a blank would fail).
      expect(await cellChars(rightEdge, expectation.sidebar[0])).toBe("┐");
    }, 120_000);
  }

  it("renders a visible scrollbar thumb in overflowing panels at 80x24", async () => {
    // At the minimum geometry every panel's content overflows its few inner
    // rows at boot, so blessed draws its single-cell scrollbar thumb. The
    // round-16 regression rendered that thumb as an invisible space.
    terminal = spawnTerminalSession({
      command: resolveNubExecutable(),
      argv: [sourceCliEntry, "--cli"],
      cols: 80,
      rows: 24,
      cwd: fixture.profile,
      env: fixture.environment,
    });
    await terminal.waitForGridText("queue:0", BOOT_TIMEOUT_MS);

    // Conversation rows 3-9 in the progressive minimum layout: the thumb
    // must sit inside the right border (column 79) on one of the inner rows
    // 4-8, right of the text gutter.
    const thumbColumns = [75, 76, 77, 78];
    const innerRows = [4, 5, 6, 7, 8];
    const thumbCells: Array<[number, number]> = [];
    for (const row of innerRows) {
      for (const column of thumbColumns) {
        if ((await cellChars(column, row)) === "█") {
          thumbCells.push([column, row]);
        }
      }
    }
    expect(
      thumbCells.length,
      `expected a visible scrollbar thumb in the Conversation inner rows, grid:\n${(
        await terminal.gridLines()
      )
        .map((line, index) => `${String(index).padStart(2)}|${line}`)
        .join("\n")}`,
    ).toBeGreaterThanOrEqual(1);

    // Status rows 10-13 also overflow at boot; at least one of its two inner
    // rows must carry a visible thumb. Collapsed Ops is hidden here rather
    // than occupying a chrome-only strip.
    const statusThumbRows = [11, 12];
    const statusThumbs: number[] = [];
    for (const row of statusThumbRows) {
      for (const column of thumbColumns) {
        if ((await cellChars(column, row)) === "█") {
          statusThumbs.push(row);
          break;
        }
      }
    }
    expect(statusThumbs.length).toBeGreaterThanOrEqual(1);
    expect((await terminal.gridLines()).join("\n")).not.toContain("Ops Stream");
  }, 120_000);
});
