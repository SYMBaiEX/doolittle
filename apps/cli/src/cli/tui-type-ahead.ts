/**
 * Type-ahead capture for the cockpit input.
 *
 * Round-17 deliberately moves focus to the processing surface while a turn is
 * active so scroll keys own the conversation. The cost: while no text entry
 * owns an active read, blessed delivers keystrokes to the focused pane and
 * they vanish — a fast typist's follow-up commands never reach the queue.
 *
 * This module implements the standard chat-TUI invariant instead: printable
 * typing is never lost. A program-level keypress hook runs ahead of blessed's
 * screen dispatch (registered with prependListener so the consume check is
 * predictive, not retrospective). When a keystroke will not be consumed by
 * any live text entry, it is captured into a pending buffer, focus is pulled
 * back to the input, and the buffered keys are replayed through blessed's own
 * textbox listener — one key per event-loop turn, so read lifecycle
 * transitions (including Enter completing a read) happen exactly as they
 * would for real typing.
 *
 * Non-goals, deliberately:
 * - Enter/Backspace are captured only while the input is focused. On pane
 *   surfaces Enter remains a control-deck action key and Backspace inert.
 * - Overlay surfaces (palette, composer) own their keys while open.
 * - Scroll and cockpit command keys are non-printing and unaffected.
 */

interface TypeAheadKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}

interface TypeAheadEntry {
  _reading?: boolean;
  __listener?: unknown;
  focus(): void;
  readInput?: () => void;
  emit(event: "keypress", ch: string | undefined, key: TypeAheadKey): void;
}

interface TypeAheadScreen {
  focused?: unknown;
  program: {
    prependListener(
      event: "keypress",
      handler: (ch: string | undefined, key: TypeAheadKey) => void,
    ): void;
    removeListener(
      event: "keypress",
      handler: (ch: string | undefined, key: TypeAheadKey) => void,
    ): void;
  };
}

interface TuiTypeAheadOptions {
  screen: TypeAheadScreen;
  inputBox: TypeAheadEntry;
  /** Every text entry that legitimately consumes keystrokes when live. */
  textEntries: TypeAheadEntry[];
  activateTextEntry: (entry: TypeAheadEntry) => void;
  isPaletteOpen: () => boolean;
  isComposerOpen: () => boolean;
}

interface TuiTypeAheadController {
  dispose: () => void;
}

// Matches blessed's textarea printable test: control characters are excluded.
// Tab (\x09) and carriage return (\x0d) slip past that filter, so named
// special keys are excluded separately below.
function isControlCharacter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x00 && code <= 0x08) ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

function isPrintableInput(ch: string | undefined, key: TypeAheadKey): boolean {
  if (!ch || key.ctrl || key.meta) return false;
  if (isControlCharacter(ch)) return false;
  // Single-character names are ordinary glyphs; longer names are special
  // keys (tab, enter, escape, arrows, function keys) except space.
  if (key.name && key.name.length > 1 && key.name !== "space") return false;
  return true;
}

const EDITING_KEYS = new Set(["enter", "backspace"]);

// Bounded so a pathological focus fight can never spin the event loop. One
// stall retry is one setImmediate turn, so this ceiling is a few milliseconds
// in practice and far above anything the activation handshake needs.
const MAX_STALLED_PUMPS = 25;

export function installTuiTypeAhead(
  options: TuiTypeAheadOptions,
): TuiTypeAheadController {
  const {
    screen,
    inputBox,
    textEntries,
    activateTextEntry,
    isPaletteOpen,
    isComposerOpen,
  } = options;

  const pending: Array<{ ch: string | undefined; key: TypeAheadKey }> = [];
  let pumpScheduled = false;
  let stalledPumps = 0;

  const entryConsumesKeys = (entry: TypeAheadEntry): boolean =>
    screen.focused === entry &&
    entry._reading === true &&
    Boolean(entry.__listener);

  const inputReady = (): boolean => entryConsumesKeys(inputBox);

  const pump = (): void => {
    pumpScheduled = false;
    const item = pending[0];
    if (!item) {
      stalledPumps = 0;
      return;
    }
    if (!inputReady()) {
      stalledPumps += 1;
      if (stalledPumps > MAX_STALLED_PUMPS) {
        pending.length = 0;
        stalledPumps = 0;
        return;
      }
      // blessed registers the read listener one tick after readInput; until
      // it is live, re-assert activation and wait another turn. Replaying
      // into a half-open read is what loses keystrokes in the first place.
      activateTextEntry(inputBox as never);
      schedulePump();
      return;
    }
    pending.shift();
    stalledPumps = 0;
    inputBox.emit("keypress", item.ch, item.key);
    if (pending.length > 0) {
      schedulePump();
    }
  };

  function schedulePump(): void {
    if (pumpScheduled) return;
    pumpScheduled = true;
    setImmediate(pump);
  }

  const onKeypress = (ch: string | undefined, key: TypeAheadKey): void => {
    if (!key) return;
    // Any live text entry owns its keystrokes; never double-feed them.
    if (textEntries.some(entryConsumesKeys)) return;
    // Overlay surfaces route their own keys while open.
    if (isPaletteOpen() || isComposerOpen()) return;

    const printable = isPrintableInput(ch, key);
    const editingKey =
      screen.focused === inputBox &&
      typeof key.name === "string" &&
      EDITING_KEYS.has(key.name);
    if (!printable && !editingKey) return;

    pending.push({ ch, key });
    activateTextEntry(inputBox as never);
    schedulePump();
  };

  // Prepended: the consume check must run before blessed's screen dispatch
  // mutates read state (Enter completing a read would make a retrospective
  // check indistinguishable from a key that was never consumed).
  screen.program.prependListener("keypress", onKeypress);

  return {
    dispose() {
      screen.program.removeListener("keypress", onKeypress);
      pending.length = 0;
    },
  };
}

export type { TuiTypeAheadController, TuiTypeAheadOptions };
