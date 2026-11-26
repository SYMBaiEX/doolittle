import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { installTuiTypeAhead } from "../../apps/cli/src/cli/tui-type-ahead";

interface TypeAheadKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}

type FakeEntry = EventEmitter & {
  _reading?: boolean;
  __listener?: unknown;
  focus(): void;
  readInput(): void;
};

type KeyHandler = (ch: string | undefined, key: TypeAheadKey) => void;

function nextImmediate(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

function createHarness(
  handlers: {
    input?: KeyHandler;
    palette?: KeyHandler;
  } = {},
  options: { paletteOpen?: boolean } = {},
) {
  const program = new EventEmitter();
  const focusedPane = {};
  const screen = {
    focused: focusedPane as unknown,
    program,
  };

  const createEntry = (onKey: KeyHandler): FakeEntry => {
    const entry = new EventEmitter() as FakeEntry;
    entry.focus = () => {
      screen.focused = entry;
    };
    entry.readInput = () => {
      entry._reading = true;
      setImmediate(() => {
        const listener: KeyHandler = (ch, key) => {
          onKey(ch, key);
        };
        entry.__listener = listener;
        entry.on("keypress", listener);
      });
    };
    return entry;
  };

  const input = createEntry(handlers.input ?? (() => undefined));
  const paletteInput = createEntry(handlers.palette ?? (() => undefined));
  const composer = createEntry(() => undefined);
  const entries = [input, paletteInput, composer];

  const press = (ch: string) => {
    const key = { name: ch };
    program.emit("keypress", ch, key);
    const focusedEntry = entries.find((entry) => screen.focused === entry);
    if (focusedEntry?._reading === true && focusedEntry.__listener) {
      focusedEntry.emit("keypress", ch, key);
    }
  };

  const controller = installTuiTypeAhead({
    screen: screen as never,
    inputBox: input as never,
    paletteInput: paletteInput as never,
    composer: composer as never,
    textEntries: [input, paletteInput, composer] as never[],
    activateTextEntry: (entry) => {
      const target = entry as unknown as FakeEntry;
      if (screen.focused !== target) target.focus();
      if (target._reading !== true) target.readInput();
    },
    isPaletteOpen: () => options.paletteOpen === true,
    isComposerOpen: () => false,
  });

  return { controller, input, paletteInput, press };
}

describe("TUI type-ahead", () => {
  it("drains buffered keys before newly consumed keys can overtake them", async () => {
    const typed: string[] = [];
    let injectOvertakingKey = true;
    let pressRef: ((ch: string) => void) | undefined;
    const { controller, press } = createHarness({
      input: (ch) => {
        typed.push(ch ?? "");
        if (ch === "!" && injectOvertakingKey) {
          injectOvertakingKey = false;
          // The first replayed key makes the input live. A real keystroke can
          // then arrive before the next setImmediate pump; it must still order
          // behind the keys that were captured before it.
          setImmediate(() => pressRef?.("h"));
        }
      },
    });
    pressRef = press;

    press("!");
    press("e");
    press("c");
    for (let turn = 0; turn < 8; turn += 1) {
      await nextImmediate();
    }

    expect(typed.join("")).toBe("!ech");
    controller.dispose();
  });

  it("buffers printable palette typing through the half-open read handshake", async () => {
    const typed: string[] = [];
    const { controller, press } = createHarness(
      { palette: (ch) => typed.push(ch ?? "") },
      { paletteOpen: true },
    );

    press("/");
    press("t");
    press("h");
    for (let turn = 0; turn < 8; turn += 1) {
      await nextImmediate();
    }

    expect(typed.join("")).toBe("/th");
    controller.dispose();
  });
});
