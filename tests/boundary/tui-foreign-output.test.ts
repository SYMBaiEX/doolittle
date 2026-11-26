import { describe, expect, it, vi } from "vitest";
import { createTuiActivityFeed } from "../../apps/cli/src/cli/tui-activity-feed";
import { installTuiForeignOutput } from "../../apps/cli/src/cli/tui-foreign-output";
import { captureBootLogs } from "../../apps/cli/src/entrypoint/boot-logs";
import type { AppLogger } from "../../packages/agent/src/logging/logger";

function createLogger(): AppLogger {
  const noop = vi.fn();
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => createLogger(),
  } as unknown as AppLogger;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

interface ForeignHarness {
  routed: Array<{ source: string; text: string }>;
  uninstall: () => void;
}

/**
 * Install the real interception against the test process's own streams. The
 * patch is always removed inside the test that installed it; while active no
 * test output may flow through console.log, so assertions run after uninstall
 * or against in-memory capture only.
 */
function installForeignHarness(options?: {
  textEntryFocused?: () => boolean;
  overlaysOpen?: () => boolean;
}): ForeignHarness {
  const routed: Array<{ source: string; text: string }> = [];
  const uninstall = installTuiForeignOutput({
    logger: createLogger(),
    isScreenDestroyed: () => false,
    isShuttingDown: () => false,
    routeForeignActivity: (source, text) => {
      routed.push({ source, text });
    },
    flushDeferredForeignActivity: vi.fn(),
    scheduleDeferredForeignRefresh: vi.fn(),
    scheduleRefreshPanels: vi.fn(),
    textEntryFocused: options?.textEntryFocused ?? (() => true),
    overlaysOpen: options?.overlaysOpen ?? (() => false),
  });
  return { routed, uninstall };
}

describe("tui foreign output line buffering", () => {
  it("joins a line split across several writes into one entry", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("splitpart-alpha");
      process.stdout.write("splitpart-beta");
      process.stdout.write("splitpart-gamma\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed).toEqual([
      {
        source: "stdout",
        text: "splitpart-alphasplitpart-betasplitpart-gamma",
      },
    ]);
  });

  it("emits multiple complete lines in order from a single write", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("first-line\nsecond-line\nthird-line\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed.map((entry) => entry.text)).toEqual([
      "first-line",
      "second-line",
      "third-line",
    ]);
  });

  it("keeps a trailing fragment until its newline arrives in a later write", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("complete\nfrag");
      process.stdout.write("ment-done\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed.map((entry) => entry.text)).toEqual([
      "complete",
      "fragment-done",
    ]);
  });

  it("treats carriage returns as line boundaries for progress-style output", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("progress-one\rprogress-two\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed.map((entry) => entry.text)).toEqual([
      "progress-one",
      "progress-two",
    ]);
  });

  it("flushes a newline-less fragment after the stream goes quiet", async () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("never-newlined");
      // No newline ever arrives; the idle flush must surface the fragment.
      await sleep(550);
      expect(harness.routed.map((entry) => entry.text)).toEqual([
        "never-newlined",
      ]);
    } finally {
      harness.uninstall();
    }
  });

  it("buffers stdout and stderr independently", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("out-part");
      process.stderr.write("err-part\n");
      process.stdout.write("-joined\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed).toEqual([
      { source: "stderr", text: "err-part" },
      { source: "stdout", text: "out-part-joined" },
    ]);
  });

  it("flushes a pending fragment when interception is torn down", () => {
    const harness = installForeignHarness();
    process.stdout.write("teardown-pending");
    harness.uninstall();
    expect(harness.routed.map((entry) => entry.text)).toContain(
      "teardown-pending",
    );
  });

  it("strips terminal control sequences without inventing line breaks", () => {
    const harness = installForeignHarness();
    try {
      process.stdout.write("\x1b[31mcolored-danger\x1b[0m\n");
    } finally {
      harness.uninstall();
    }
    expect(harness.routed.map((entry) => entry.text)).toEqual([
      "colored-danger",
    ]);
  });
});

interface FeedHarness {
  feed: ReturnType<typeof createTuiActivityFeed>;
  logged: string[];
  setDefer(value: boolean): void;
}

function createFeedHarness(initialDefer: boolean): FeedHarness {
  const logged: string[] = [];
  let defer = initialDefer;
  const feed = createTuiActivityFeed({
    activityPane: {
      log(content: string) {
        logged.push(content);
      },
    },
    state: { notices: [] } as never,
    shouldDeferForeignActivity: () => defer,
    scheduleRefreshPanels: vi.fn(),
  });
  return {
    feed,
    logged,
    setDefer(value: boolean) {
      defer = value;
    },
  };
}

describe("tui activity feed foreign routing", () => {
  it("defers while focused and releases the backlog in order once unfocused", async () => {
    const harness = createFeedHarness(true);
    try {
      harness.feed.routeForeignActivity("stdout", "deferred-one");
      harness.feed.routeForeignActivity("stdout", "deferred-two");
      expect(harness.logged).toHaveLength(0);

      // Focus leaves the text entry; the retry timer must drain the backlog
      // without any further writes arriving.
      harness.setDefer(false);
      await sleep(500);

      expect(harness.logged).toHaveLength(2);
      expect(harness.logged[0]).toContain("deferred-one");
      expect(harness.logged[1]).toContain("deferred-two");
    } finally {
      harness.feed.dispose();
    }
  });

  it("keeps FIFO order when new output arrives as the backlog underrides", async () => {
    const harness = createFeedHarness(true);
    try {
      harness.feed.routeForeignActivity("stdout", "queued-first");
      harness.feed.routeForeignActivity("stdout", "queued-second");
      expect(harness.logged).toHaveLength(0);

      // Deferral lifts before the next write: the queued entries must flush
      // ahead of the new one, never behind it.
      harness.setDefer(false);
      harness.feed.routeForeignActivity("stdout", "live-third");

      expect(harness.logged).toHaveLength(3);
      expect(harness.logged[0]).toContain("queued-first");
      expect(harness.logged[1]).toContain("queued-second");
      expect(harness.logged[2]).toContain("live-third");
    } finally {
      harness.feed.dispose();
    }
  });

  it("bounds the deferred backlog so a focused session cannot grow memory", () => {
    const harness = createFeedHarness(true);
    try {
      for (let index = 0; index < 500; index++) {
        harness.feed.routeForeignActivity("stdout", `flood-${index}`);
      }
      expect(harness.logged).toHaveLength(0);
      harness.setDefer(false);
      harness.feed.flushDeferredForeignActivity();
      // Only the newest entries survive; the oldest dropped first.
      expect(harness.logged.length).toBe(400);
      expect(harness.logged[0]).toContain("flood-100");
      expect(harness.logged[399]).toContain("flood-499");
    } finally {
      harness.feed.dispose();
    }
  });
});

describe("boot log capture line buffering", () => {
  it("reassembles lines split across writes during the boot window", async () => {
    const { logs } = await captureBootLogs(true, async () => {
      process.stdout.write("bootsplit-one");
      process.stdout.write("-bootsplit-two\n");
      process.stderr.write("booterr-alpha\nbooterr-beta\n");
    });
    expect(logs).toEqual([
      { source: "stdout", text: "bootsplit-one-bootsplit-two" },
      { source: "stderr", text: "booterr-alpha" },
      { source: "stderr", text: "booterr-beta" },
    ]);
  });

  it("flushes a trailing fragment when the capture window closes", async () => {
    const { logs } = await captureBootLogs(true, async () => {
      process.stdout.write("boot-no-newline");
    });
    expect(logs).toEqual([{ source: "stdout", text: "boot-no-newline" }]);
  });
});
