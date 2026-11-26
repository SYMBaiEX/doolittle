import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startBusySpinner,
  stopBusySpinner,
} from "../../apps/cli/src/cli/tui-control-deck/spinner";
import type { TuiControlDeckState } from "../../apps/cli/src/cli/tui-control-deck/types";

interface SpinnerHarness {
  state: TuiControlDeckState;
  fullRenders: number;
  drawnRanges: Array<[number, number]>;
  footerRenders: number;
  paintedContent: string[];
  frames: string[];
}

function createSpinnerHarness(options?: {
  frames?: string[];
  withPartialSurface?: boolean;
}): SpinnerHarness {
  const frames = options?.frames ?? ["(1)", "(2)", "(3)", "(4)"];
  const harness: SpinnerHarness = {
    state: {
      footerHint: "hint",
      busyFrameIndex: 0,
      busySpinnerTimer: null,
      renderToken: 0,
    },
    fullRenders: 0,
    drawnRanges: [],
    footerRenders: 0,
    paintedContent: [],
    frames,
  };

  const screen = {
    destroyed: false,
    render: () => {
      harness.fullRenders += 1;
    },
    draw: (start: number, end: number) => {
      harness.drawnRanges.push([start, end]);
    },
  };

  const partialSurface =
    options?.withPartialSurface === false
      ? {}
      : {
          render: () => {
            harness.footerRenders += 1;
          },
          lpos: { xi: 0, xl: 160, yi: 44, yl: 45 },
        };

  const footer = {
    setContent: (content: string) => {
      harness.paintedContent.push(content);
    },
    ...partialSurface,
  };

  startBusySpinner(
    {
      screen: screen as never,
      footer: footer as never,
      getBusyFrames: () => harness.frames,
      buildFooterContent: (hint, busyFrame) => `${hint} ${busyFrame}`,
    },
    harness.state,
  );
  return harness;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("control deck busy spinner paint cost", () => {
  it("paints through the footer rows instead of re-rendering the screen", async () => {
    const harness = createSpinnerHarness();
    try {
      await sleep(520);
      // ~4 ticks at the 120ms cadence: every one of them must avoid the
      // whole-screen render on the ordinary paint path.
      expect(harness.state.busySpinnerStats?.ticks).toBeGreaterThanOrEqual(3);
      expect(harness.fullRenders).toBe(0);
      expect(harness.footerRenders).toBeGreaterThanOrEqual(3);
      expect(harness.drawnRanges.length).toBeGreaterThanOrEqual(3);
      for (const [start, end] of harness.drawnRanges) {
        expect([start, end]).toEqual([44, 44]);
      }
    } finally {
      stopBusySpinner(harness.state);
    }
  });

  it("falls back to a full render on the periodic backstop tick", async () => {
    const harness = createSpinnerHarness();
    try {
      // 16 painted ticks trigger one full-render backstop: 16 * 120ms ≈ 2s.
      await sleep(2_300);
      expect(harness.fullRenders).toBeGreaterThanOrEqual(1);
      expect(harness.footerRenders).toBeGreaterThan(harness.fullRenders * 4);
    } finally {
      stopBusySpinner(harness.state);
    }
  });

  it("falls back to full renders when the footer lacks a partial surface", async () => {
    const harness = createSpinnerHarness({ withPartialSurface: false });
    try {
      await sleep(400);
      expect(harness.fullRenders).toBeGreaterThanOrEqual(2);
      expect(harness.drawnRanges).toHaveLength(0);
    } finally {
      stopBusySpinner(harness.state);
    }
  });

  it("skips ticks whose rendered frame content does not change", async () => {
    const harness = createSpinnerHarness({ frames: ["(static)"] });
    try {
      await sleep(520);
      // A single-frame theme produces one initial paint and then pure no-op
      // ticks until the periodic backstop.
      const stats = harness.state.busySpinnerStats;
      expect(stats).toBeDefined();
      expect(stats?.skippedUnchanged).toBeGreaterThanOrEqual(2);
      expect(harness.paintedContent.length).toBeLessThanOrEqual(2);
    } finally {
      stopBusySpinner(harness.state);
    }
  });

  it("records per-window paint statistics", async () => {
    const harness = createSpinnerHarness();
    await sleep(400);
    stopBusySpinner(harness.state);
    const stats = harness.state.busySpinnerStats;
    expect(stats).toBeDefined();
    expect(stats?.partialPaints).toBeGreaterThanOrEqual(2);
    expect(stats?.ticks).toBeGreaterThanOrEqual(stats?.partialPaints ?? 0);
  });
});
