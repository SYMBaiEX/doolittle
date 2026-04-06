import { describe, expect, it } from "bun:test";
import type blessed from "blessed";
import {
  createTuiTextEntryController,
  type InteractiveTextEntry,
} from "@/cli/tui-text-entry";

function createEntry(): InteractiveTextEntry {
  return {
    _reading: false,
    _done() {},
    focus() {},
    readInput() {},
    cancel() {},
  } as unknown as InteractiveTextEntry;
}

describe("createTuiTextEntryController", () => {
  it("focuses and starts reading when activating an entry", () => {
    const screen = { focused: null } as unknown as blessed.Widgets.Screen;
    const inputBox = createEntry();
    const composer = createEntry();
    const paletteInput = createEntry();
    const responsePane = { focus() {} } as blessed.Widgets.BlessedElement;
    let focused = 0;
    let started = 0;
    let lastTextEntryAt = 0;
    inputBox.focus = () => {
      focused += 1;
      screen.focused = inputBox;
    };
    inputBox.readInput = () => {
      started += 1;
    };

    const controller = createTuiTextEntryController({
      screen,
      state: {
        busy: false,
        paletteOpen: false,
        composerOpen: false,
        focusIndex: 0,
      },
      inputBox,
      composer,
      paletteInput,
      responsePane,
      primaryFocusIndex: 2,
      renderScreen() {},
      updateFooterHint() {},
      getLastTextEntryAt: () => lastTextEntryAt,
      setLastTextEntryAt: (value) => {
        lastTextEntryAt = value;
      },
    });

    controller.activateTextEntry(inputBox);

    expect(focused).toBe(1);
    expect(started).toBe(1);
    expect(lastTextEntryAt).toBeGreaterThan(0);
    expect(controller.textEntryFocused()).toBe(true);
  });

  it("cancels active input when deactivating a live entry", () => {
    const screen = { focused: null } as unknown as blessed.Widgets.Screen;
    const inputBox = createEntry();
    const composer = createEntry();
    const paletteInput = createEntry();
    const responsePane = { focus() {} } as blessed.Widgets.BlessedElement;
    let cancelled = 0;
    composer._reading = true;
    composer.cancel = () => {
      cancelled += 1;
    };

    const controller = createTuiTextEntryController({
      screen,
      state: {
        busy: false,
        paletteOpen: false,
        composerOpen: false,
        focusIndex: 0,
      },
      inputBox,
      composer,
      paletteInput,
      responsePane,
      primaryFocusIndex: 2,
      renderScreen() {},
      updateFooterHint() {},
      getLastTextEntryAt: () => Date.now(),
      setLastTextEntryAt() {},
    });

    controller.deactivateTextEntry(composer);

    expect(cancelled).toBe(1);
    expect(controller.textEntryRecentlyActive()).toBe(true);
  });

  it("defer logic and focus helpers honor busy state, overlays, and response focus", () => {
    const screenState = {
      focused: null as blessed.Widgets.BlessedElement | null,
      render() {
        renderCount += 1;
      },
    };
    const screen = screenState as unknown as blessed.Widgets.Screen;
    const inputBox = createEntry();
    const composer = createEntry();
    const paletteInput = createEntry();
    const state = {
      busy: false,
      paletteOpen: false,
      composerOpen: false,
      focusIndex: 0,
    };
    let lastTextEntryAt = 0;
    let renderCount = 0;
    let footerUpdates = 0;
    let responseFocuses = 0;
    const responsePane = {
      focus() {
        responseFocuses += 1;
      },
    } as blessed.Widgets.BlessedElement;
    inputBox.focus = () => {
      screen.focused = inputBox;
    };

    const controller = createTuiTextEntryController({
      screen,
      state,
      inputBox,
      composer,
      paletteInput,
      responsePane,
      primaryFocusIndex: 4,
      renderScreen() {
        renderCount += 1;
      },
      updateFooterHint() {
        footerUpdates += 1;
      },
      getLastTextEntryAt: () => lastTextEntryAt,
      setLastTextEntryAt(value) {
        lastTextEntryAt = value;
      },
    });

    controller.focusPrimaryInput();
    expect(state.focusIndex).toBe(4);
    expect(renderCount).toBe(1);
    expect(controller.shouldDeferForeignActivity()).toBe(true);

    screenState.focused = null;
    lastTextEntryAt = Date.now() - 500;
    expect(controller.shouldDeferForeignActivity()).toBe(false);

    state.paletteOpen = true;
    expect(controller.shouldDeferForeignActivity()).toBe(true);
    state.paletteOpen = false;
    state.busy = true;
    expect(controller.shouldDeferForeignActivity()).toBe(true);

    controller.focusProcessingSurface();
    expect(responseFocuses).toBe(1);
    expect(footerUpdates).toBe(1);
    expect(renderCount).toBe(2);
  });
});
