import { PassThrough } from "node:stream";
import blessed from "blessed";
import { afterEach, describe, expect, it } from "vitest";
import { installBlessedTextboxGuard } from "../../apps/cli/src/cli/blessed-guards";

installBlessedTextboxGuard(blessed);

type ReadProbe = blessed.Widgets.TextboxElement & {
  _reading?: boolean;
  __listener?: unknown;
  listeners(event: "keypress"): unknown[];
};

const screens: blessed.Widgets.Screen[] = [];

function nextImmediate(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

function createHarness() {
  const output = new PassThrough() as PassThrough & {
    columns: number;
    rows: number;
  };
  output.columns = 80;
  output.rows = 24;
  const input = new PassThrough();
  const screen = blessed.screen({
    smartCSR: false,
    output: output as never,
    input: input as never,
    terminal: "xterm-256color",
  });
  screens.push(screen);
  const entry = blessed.textbox({
    parent: screen,
    width: 20,
    height: 3,
  }) as ReadProbe;
  const other = blessed.box({
    parent: screen,
    top: 4,
    width: 20,
    height: 3,
    focusable: true,
  });
  return { entry, other };
}

afterEach(() => {
  for (const screen of screens.splice(0)) {
    try {
      screen.destroy();
    } catch {
      // Headless screens have no real program to tear down.
    }
  }
});

describe("blessed read lifecycle guards", () => {
  it("cancel completes a half-open read instead of leaving it zombie-enabled", async () => {
    const { entry, other } = createHarness();
    entry.focus();
    entry.readInput();
    expect(entry._reading).toBe(true);
    expect(entry.__listener).toBeUndefined();

    entry.cancel();
    expect(entry._reading).toBe(false);
    other.focus();
    await nextImmediate();
    await nextImmediate();

    expect(entry.__listener).toBeUndefined();
    expect(entry.listeners("keypress")).toHaveLength(0);
  });

  it("does not duplicate keys after a close and reopen inside the listener handoff", async () => {
    const { entry, other } = createHarness();
    entry.focus();
    entry.readInput();
    entry.cancel();
    other.focus();
    entry.focus();
    entry.readInput();
    await nextImmediate();
    await nextImmediate();

    expect(entry.listeners("keypress")).toHaveLength(1);
    entry.emit("keypress", "x", { name: "x" });
    expect(entry.getValue()).toBe("x");
  });
});
