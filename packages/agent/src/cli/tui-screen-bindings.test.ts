import { describe, expect, it } from "bun:test";
import type { ControlDeckMode } from "@/cli/tui-control-deck";
import { installTuiScreenBindings } from "@/cli/tui-screen-bindings";

function createScreen() {
  const handlers = new Map<string, () => void>();
  let renderCount = 0;
  return {
    focused: undefined as unknown,
    key(keys: string[], handler: () => void) {
      for (const key of keys) {
        handlers.set(key, handler);
      }
    },
    render() {
      renderCount += 1;
    },
    emitKey(key: string) {
      handlers.get(key)?.();
    },
    get renderCount() {
      return renderCount;
    },
  };
}

function createFocusable() {
  let focused = 0;
  let content = "";
  const scrolls: number[] = [];
  return {
    focus() {
      focused += 1;
    },
    scroll(delta: number) {
      scrolls.push(delta);
    },
    setContent(next: string) {
      content = next;
    },
    get focused() {
      return focused;
    },
    get content() {
      return content;
    },
    get scrolls() {
      return scrolls;
    },
  };
}

describe("installTuiScreenBindings", () => {
  it("switches deck modes and queues focused assist/sidebar commands", () => {
    const screen = createScreen();
    const response = createFocusable();
    const activity = createFocusable();
    const sidebar = createFocusable();
    const assistBox = createFocusable();
    const paletteList = createFocusable();
    const queued: string[] = [];
    const refreshCalls: string[] = [];
    const modeChanges: ControlDeckMode[] = [];
    let controlDeckMode: ControlDeckMode = "assist";

    installTuiScreenBindings({
      screen,
      inputBox: {
        getValue: () => "/theme n",
      },
      response,
      activity,
      sidebar,
      assistBox,
      paletteInput: {},
      paletteList,
      focusables: [activity, response, sidebar, assistBox, {}],
      getFocusIndex: () => 0,
      setFocusIndex: () => {},
      activateTextEntry: () => {},
      deactivateTextEntry: () => {},
      textEntryFocused: () => false,
      isPaletteOpen: () => false,
      isComposerOpen: () => false,
      getControlDeckMode: () => controlDeckMode,
      setControlDeckMode: (mode) => {
        controlDeckMode = mode;
        modeChanges.push(mode);
      },
      refreshPanels: async () => {
        refreshCalls.push("refresh");
      },
      updateFooterHint: () => {},
      queueCommand: (line) => {
        queued.push(line);
      },
      workspaceDir: "/tmp",
      lifecycle: {
        exitCli: () => {},
        handleSigint: () => {},
      },
      overlays: {
        openPalette: () => {},
        openComposer: () => {},
        closePalette: () => {},
        closeComposer: () => {},
      },
      clearActivity: () => {},
      resetResponses: () => {},
      exportTranscript: () => {},
      toggleOpsCollapsed: () => {},
    });

    screen.emitKey("C-g");
    expect(modeChanges).toEqual(["gateway"]);
    expect(refreshCalls).toEqual(["refresh"]);

    screen.focused = sidebar;
    screen.emitKey("enter");
    controlDeckMode = "jobs";
    screen.focused = assistBox;
    screen.emitKey("enter");

    expect(queued).toEqual(["/sessions-list", "/jobs"]);
  });

  it("respects palette navigation and transcript shortcuts", () => {
    const screen = createScreen();
    const response = createFocusable();
    const activity = createFocusable();
    const sidebar = createFocusable();
    const assistBox = createFocusable();
    const paletteList = createFocusable();
    const activityPanel = createFocusable();
    let footerUpdates = 0;
    let clearedActivity = 0;
    let clearedResponses = 0;
    let exported = 0;

    installTuiScreenBindings({
      screen,
      inputBox: {
        getValue: () => "",
      },
      response,
      activity: activityPanel,
      sidebar,
      assistBox,
      paletteInput: {},
      paletteList,
      focusables: [activity, response, sidebar, assistBox, {}],
      getFocusIndex: () => 0,
      setFocusIndex: () => {},
      activateTextEntry: () => {
        footerUpdates += 1;
      },
      deactivateTextEntry: () => {
        footerUpdates += 1;
      },
      textEntryFocused: () => false,
      isPaletteOpen: () => true,
      isComposerOpen: () => false,
      getControlDeckMode: () => "assist",
      setControlDeckMode: () => {},
      refreshPanels: async () => {},
      updateFooterHint: () => {
        footerUpdates += 1;
      },
      queueCommand: () => {},
      workspaceDir: "/tmp",
      lifecycle: {
        exitCli: () => {},
        handleSigint: () => {},
      },
      overlays: {
        openPalette: () => {},
        openComposer: () => {},
        closePalette: () => {},
        closeComposer: () => {},
      },
      clearActivity: () => {
        clearedActivity += 1;
      },
      resetResponses: () => {
        clearedResponses += 1;
      },
      exportTranscript: () => {
        exported += 1;
      },
      toggleOpsCollapsed: () => {},
    });

    screen.emitKey("tab");
    screen.emitKey("C-l");
    screen.emitKey("C-x");

    expect(paletteList.focused).toBe(1);
    expect(footerUpdates).toBeGreaterThan(0);
    expect(clearedActivity).toBe(1);
    expect(clearedResponses).toBe(1);
    expect(exported).toBe(1);
  });
});
