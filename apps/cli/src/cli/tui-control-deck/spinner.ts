import { writeFileSync } from "node:fs";
import { renderFooterContent } from "./footer";
import type { TuiControlDeckOptions, TuiControlDeckState } from "./types";

/**
 * The busy spinner advances one small frame in the footer. Repainting that
 * frame through `screen.render()` re-renders every element in the tree —
 * re-parsing the full transcript, ops log, and each panel — just to move a
 * few characters on one row. Blessed's diffing keeps the emitted bytes small,
 * but the CPU cost of the recursive re-render is real: with a cockpit-sized
 * layout a full render measures roughly 50x the cost of repainting only the
 * footer's rows (`footer.render()` + `screen.draw(yi, yl - 1)`), and both
 * produce the same terminal output because `draw` cell-diffs either way.
 *
 * The tick therefore paints through the footer's rows only. Two backstops
 * keep this honest:
 * - frames whose rendered content did not change are skipped entirely;
 * - every Nth painted tick falls back to a full `screen.render()` so any
 *   cockpit mutation that somehow missed its own render scheduling still
 *   converges within a couple of seconds instead of never repainting.
 */
const SPINNER_TICK_MS = 120;
const FULL_RENDER_EVERY_NTH_PAINT = 16;

export interface BusySpinnerPaintStats {
  ticks: number;
  skippedUnchanged: number;
  partialPaints: number;
  fullRenders: number;
}

export function createBusySpinnerPaintStats(): BusySpinnerPaintStats {
  return { ticks: 0, skippedUnchanged: 0, partialPaints: 0, fullRenders: 0 };
}

function paintFooterRowsOnly(
  options: Pick<TuiControlDeckOptions, "screen" | "footer">,
): boolean {
  const footer = options.footer;
  const screen = options.screen as {
    destroyed?: boolean;
    draw(start: number, end: number): void;
  };
  if (screen.destroyed || typeof footer.render !== "function" || !footer.lpos) {
    return false;
  }
  const { yi, yl } = footer.lpos;
  if (!Number.isFinite(yi) || !Number.isFinite(yl) || yl <= yi) {
    return false;
  }
  footer.render();
  screen.draw(yi, yl - 1);
  return true;
}

export function startBusySpinner(
  options: Pick<
    TuiControlDeckOptions,
    "screen" | "footer" | "getBusyFrames" | "buildFooterContent"
  >,
  state: TuiControlDeckState,
): void {
  if (state.busySpinnerTimer) {
    return;
  }
  let lastPaintedContent: string | null = null;
  let paintedTicks = 0;
  state.busySpinnerStats = createBusySpinnerPaintStats();
  const stats = state.busySpinnerStats;
  state.busySpinnerTimer = setInterval(() => {
    stats.ticks += 1;
    const frames = options.getBusyFrames();
    state.busyFrameIndex =
      frames.length > 0 ? (state.busyFrameIndex + 1) % frames.length : 0;
    const content = renderFooterContent(options, state);

    const dueFullRender =
      paintedTicks > 0 && paintedTicks % FULL_RENDER_EVERY_NTH_PAINT === 0;
    if (content === lastPaintedContent && !dueFullRender) {
      // Steady-state no-op: the frame glyph repeated (single-frame themes or
      // duplicated frames), so repainting would emit zero cell diffs.
      stats.skippedUnchanged += 1;
      return;
    }

    options.footer.setContent(content);
    lastPaintedContent = content;
    paintedTicks += 1;

    if (!dueFullRender && paintFooterRowsOnly(options)) {
      stats.partialPaints += 1;
      return;
    }
    stats.fullRenders += 1;
    options.screen.render();
  }, SPINNER_TICK_MS);
}

export function stopBusySpinner(state: TuiControlDeckState): void {
  if (!state.busySpinnerTimer) {
    return;
  }
  clearInterval(state.busySpinnerTimer);
  state.busySpinnerTimer = null;
  state.busyFrameIndex = 0;

  // Opt-in diagnostic snapshot so acceptance tests and operators can verify
  // real paint behavior (partial vs full render cadence) in a live cockpit.
  const statsPath = process.env.DOOLITTLE_SPINNER_STATS;
  if (statsPath && state.busySpinnerStats) {
    try {
      writeFileSync(statsPath, JSON.stringify(state.busySpinnerStats));
    } catch {
      // Diagnostics must never break shutdown.
    }
  }
}
