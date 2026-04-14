import { describe, expect, it } from "bun:test";
import {
  type ControlDeckMode,
  installTuiControlDeck,
} from "@/cli/tui-control-deck";

function createBox() {
  let label = "";
  let content = "";
  return {
    setLabel(next: string) {
      label = next;
    },
    setContent(next: string) {
      content = next;
    },
    readLabel() {
      return label;
    },
    readContent() {
      return content;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("installTuiControlDeck", () => {
  it("updates footer hints from the current focus and mode", () => {
    const responsePane = {};
    const activityPane = {};
    const sidebarPane = {};
    const assistBox = createBox();
    const footer = createBox();
    const inputBox = {
      getValue: () => "",
    };
    const paletteList = {};
    let mode: ControlDeckMode = "responses";
    let renderCount = 0;

    const controlDeck = installTuiControlDeck({
      screen: {
        focused: assistBox,
        render() {
          renderCount += 1;
        },
      } as never,
      responsePane: responsePane as never,
      activityPane: activityPane as never,
      sidebarPane: sidebarPane as never,
      assistBox,
      footer,
      inputBox: inputBox as never,
      paletteList: paletteList as never,
      getCurrentMode: () => mode,
      isPaletteOpen: () => false,
      isComposerOpen: () => false,
      formatKeyLabel: (label) => label,
      flushDeferredForeignActivity: () => {},
      getBusyFrames: () => ["•", "◦"],
      buildFooterContent: (hint, busyFrame) => `${hint} :: ${busyFrame}`,
      renderAssistSuggestionsContent: (value) => `assist:${value}`,
      renderNonAssistControlDeckContent: async (nextMode) => nextMode,
    });

    controlDeck.updateFooterHint();
    expect(footer.readContent()).toBe("Enter responses list :: •");
    expect(renderCount).toBe(1);

    mode = "assist";
    controlDeck.updateFooterHint({ render: false });
    expect(footer.readContent()).toBe("Enter top suggestion :: •");
  });

  it("prefers palette and composer hints over focused pane hints", () => {
    const responsePane = {};
    const assistBox = createBox();
    const footer = createBox();
    const inputBox = {
      getValue: () => "",
    };
    const paletteList = {};
    let renderCount = 0;
    let paletteOpen = true;
    let composerOpen = false;

    const controlDeck = installTuiControlDeck({
      screen: {
        focused: responsePane,
        render() {
          renderCount += 1;
        },
      } as never,
      responsePane: responsePane as never,
      activityPane: {} as never,
      sidebarPane: {} as never,
      assistBox,
      footer,
      inputBox: inputBox as never,
      paletteList: paletteList as never,
      getCurrentMode: () => "gateway",
      isPaletteOpen: () => paletteOpen,
      isComposerOpen: () => composerOpen,
      formatKeyLabel: (label) => `fmt:${label}`,
      flushDeferredForeignActivity: () => {},
      getBusyFrames: () => ["•", "◦"],
      buildFooterContent: (hint, busyFrame) => `${hint} :: ${busyFrame}`,
      renderAssistSuggestionsContent: (value) => `assist:${value}`,
      renderNonAssistControlDeckContent: async (mode) => mode,
    });

    controlDeck.updateFooterHint();
    expect(footer.readContent()).toBe("Enter search top match :: •");

    paletteOpen = false;
    composerOpen = true;
    controlDeck.updateFooterHint();
    expect(footer.readContent()).toBe("fmt:Ctrl-S submit draft :: •");
    expect(renderCount).toBe(2);
  });

  it("prevents stale async control-deck renders from overwriting newer assist content", async () => {
    const responsePane = {};
    const activityPane = {};
    const sidebarPane = {};
    const assistBox = createBox();
    const footer = createBox();
    const gatewayContent = deferred<string>();
    let mode: ControlDeckMode = "gateway";

    const controlDeck = installTuiControlDeck({
      screen: {
        focused: assistBox,
        render() {},
      } as never,
      responsePane: responsePane as never,
      activityPane: activityPane as never,
      sidebarPane: sidebarPane as never,
      assistBox,
      footer,
      inputBox: {
        getValue: () => "",
      } as never,
      paletteList: {} as never,
      getCurrentMode: () => mode,
      isPaletteOpen: () => false,
      isComposerOpen: () => false,
      formatKeyLabel: (label) => label,
      flushDeferredForeignActivity: () => {},
      getBusyFrames: () => ["•", "◦"],
      buildFooterContent: (hint, busyFrame) => `${hint} :: ${busyFrame}`,
      renderAssistSuggestionsContent: (value) => `assist:${value}`,
      renderNonAssistControlDeckContent: async () => gatewayContent.promise,
    });

    const pendingRender = controlDeck.renderCurrentControlDeck();
    mode = "assist";
    controlDeck.renderAssistSuggestions("hello");
    gatewayContent.resolve("gateway");
    await pendingRender;

    expect(assistBox.readLabel()).toBe(" Control Deck · Assist ");
    expect(assistBox.readContent()).toBe("assist:hello");
  });
});
