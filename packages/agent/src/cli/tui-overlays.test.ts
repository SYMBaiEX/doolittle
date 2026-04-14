import { describe, expect, it } from "bun:test";
import { installTuiOverlays, type TuiOverlayState } from "@/cli/tui-overlays";

type Handler = (...args: unknown[]) => void;

function createTextbox(initialValue = "") {
  let value = initialValue;
  let visible = false;
  let focused = false;
  let items: string[] = [];
  let selectedIndex = -1;
  const keyHandlers = new Map<string, Handler>();
  const eventHandlers = new Map<string, Handler>();

  return {
    show() {
      visible = true;
    },
    hide() {
      visible = false;
    },
    setValue(next: string) {
      value = next;
    },
    getValue() {
      return value;
    },
    clearValue() {
      value = "";
    },
    setItems(next: string[]) {
      items = next.slice();
    },
    readItems() {
      return items.slice();
    },
    select(index: number) {
      selectedIndex = index;
    },
    readSelectedIndex() {
      return selectedIndex;
    },
    focus() {
      focused = true;
    },
    wasFocused() {
      return focused;
    },
    key(key: string, handler: Handler) {
      keyHandlers.set(key, handler);
    },
    on(event: string, handler: Handler) {
      eventHandlers.set(event, handler);
    },
    triggerKey(key: string) {
      keyHandlers.get(key)?.();
    },
    triggerEvent(event: string, ...args: unknown[]) {
      eventHandlers.get(event)?.(...args);
    },
    isVisible() {
      return visible;
    },
  };
}

describe("installTuiOverlays", () => {
  it("opens the palette with preserved input and restores focus when closed", () => {
    const state: TuiOverlayState = {
      paletteOpen: false,
      composerOpen: false,
      paletteSelectionIndex: 0,
    };
    const paletteOverlay = createTextbox();
    const paletteInput = createTextbox();
    const paletteList = createTextbox();
    const composerOverlay = createTextbox();
    const composer = createTextbox();
    const inputBox = createTextbox();
    let footerUpdates = 0;
    let focusRestores = 0;

    const overlays = installTuiOverlays({
      workspaceDir: "/tmp",
      paletteOverlay: paletteOverlay as never,
      paletteInput: paletteInput as never,
      paletteList: paletteList as never,
      composerOverlay: composerOverlay as never,
      composer: composer as never,
      inputBox: inputBox as never,
      overlayState: state,
      activateTextEntry: (entry) => {
        (entry as unknown as { focus(): void }).focus();
      },
      deactivateTextEntry: () => {},
      focusPrimaryInput: () => {
        focusRestores += 1;
      },
      updateFooterHint: () => {
        footerUpdates += 1;
      },
      noteTextEntryActivity: () => {},
      queueCommand: () => {},
      screenRender: () => {},
    });

    overlays.openPalette("/theme");

    expect(state.paletteOpen).toBe(true);
    expect(paletteOverlay.isVisible()).toBe(true);
    expect(paletteInput.getValue()).toBe("/theme");
    expect(paletteList.readSelectedIndex()).toBe(0);
    expect(paletteInput.wasFocused()).toBe(true);
    expect(footerUpdates).toBe(1);

    overlays.closePalette();

    expect(state.paletteOpen).toBe(false);
    expect(paletteOverlay.isVisible()).toBe(false);
    expect(paletteInput.getValue()).toBe("");
    expect(focusRestores).toBe(1);
  });

  it("submits composer content through the shared queue command path", () => {
    const state: TuiOverlayState = {
      paletteOpen: false,
      composerOpen: false,
      paletteSelectionIndex: 0,
    };
    const paletteOverlay = createTextbox();
    const paletteInput = createTextbox();
    const paletteList = createTextbox();
    const composerOverlay = createTextbox();
    const composer = createTextbox();
    const inputBox = createTextbox();
    const queued: string[] = [];

    const overlays = installTuiOverlays({
      workspaceDir: "/tmp",
      paletteOverlay: paletteOverlay as never,
      paletteInput: paletteInput as never,
      paletteList: paletteList as never,
      composerOverlay: composerOverlay as never,
      composer: composer as never,
      inputBox: inputBox as never,
      overlayState: state,
      activateTextEntry: (entry) => {
        (entry as unknown as { focus(): void }).focus();
      },
      deactivateTextEntry: () => {},
      focusPrimaryInput: () => {},
      updateFooterHint: () => {},
      noteTextEntryActivity: () => {},
      queueCommand: (line) => {
        queued.push(line);
      },
      screenRender: () => {},
    });

    overlays.openComposer("draft request");
    composer.triggerKey("C-s");

    expect(state.composerOpen).toBe(false);
    expect(composerOverlay.isVisible()).toBe(false);
    expect(queued).toEqual(["draft request"]);
  });

  it("navigates palette suggestions and queues the selected command", () => {
    const state: TuiOverlayState = {
      paletteOpen: false,
      composerOpen: false,
      paletteSelectionIndex: 0,
    };
    const paletteOverlay = createTextbox();
    const paletteInput = createTextbox();
    const paletteList = createTextbox();
    const composerOverlay = createTextbox();
    const composer = createTextbox();
    const inputBox = createTextbox();
    const queued: string[] = [];

    const overlays = installTuiOverlays({
      workspaceDir: "/tmp",
      paletteOverlay: paletteOverlay as never,
      paletteInput: paletteInput as never,
      paletteList: paletteList as never,
      composerOverlay: composerOverlay as never,
      composer: composer as never,
      inputBox: inputBox as never,
      overlayState: state,
      activateTextEntry: (entry) => {
        (entry as unknown as { focus(): void }).focus();
      },
      deactivateTextEntry: () => {},
      focusPrimaryInput: () => {},
      updateFooterHint: () => {},
      noteTextEntryActivity: () => {},
      queueCommand: (line) => {
        queued.push(line);
      },
      screenRender: () => {},
    });

    overlays.openPalette();
    paletteList.triggerKey("down");
    paletteList.triggerKey("enter");

    expect(state.paletteOpen).toBe(false);
    expect(state.paletteSelectionIndex).toBe(1);
    expect(queued).toEqual(["/commands-search <query>"]);
  });
});
