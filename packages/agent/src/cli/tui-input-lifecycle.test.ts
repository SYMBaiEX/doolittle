import { describe, expect, it } from "bun:test";
import { installTuiInputLifecycle } from "@/cli/tui-input-lifecycle";

function createInputBox() {
  const events: string[] = [];
  return {
    clearValue() {
      events.push("clear");
    },
    get events() {
      return events;
    },
  };
}

function createScreen() {
  let renders = 0;
  return {
    render() {
      renders += 1;
    },
    get renders() {
      return renders;
    },
  };
}

describe("installTuiInputLifecycle", () => {
  it("resets input state after queue submissions", () => {
    const inputBox = createInputBox();
    const screen = createScreen();
    const assistSuggestions: string[] = [];
    const controller = installTuiInputLifecycle({
      inputBox,
      activateTextEntry: () => {},
      screen,
      refreshPanels: async () => {},
      renderAssistSuggestions(value) {
        assistSuggestions.push(value);
      },
      updateFooterHint: () => {},
    });

    controller.resetInputAfterQueue();

    expect(inputBox.events).toEqual(["clear"]);
    expect(assistSuggestions).toEqual([""]);
    expect(screen.renders).toBe(1);
  });

  it("restores active input after run and refreshes the screen", async () => {
    const inputBox = createInputBox();
    const screen = createScreen();
    const assistSuggestions: string[] = [];
    let refreshCount = 0;
    let activated = 0;
    let footerHints = 0;

    const controller = installTuiInputLifecycle({
      inputBox,
      activateTextEntry: () => {
        activated += 1;
      },
      screen,
      refreshPanels: async () => {
        refreshCount += 1;
      },
      renderAssistSuggestions(value) {
        assistSuggestions.push(value);
      },
      updateFooterHint: () => {
        footerHints += 1;
      },
    });

    await controller.restoreInputAfterRun();

    expect(refreshCount).toBe(1);
    expect(inputBox.events).toEqual(["clear"]);
    expect(assistSuggestions).toEqual([""]);
    expect(activated).toBe(1);
    expect(footerHints).toBe(1);
    expect(screen.renders).toBe(1);
  });

  it("restores prompt focus on empty submit", () => {
    const inputBox = createInputBox();
    const screen = createScreen();
    let activated = 0;
    const controller = installTuiInputLifecycle({
      inputBox,
      activateTextEntry: () => {
        activated += 1;
      },
      screen,
      refreshPanels: async () => {},
      renderAssistSuggestions: () => {},
      updateFooterHint: () => {},
    });

    controller.handleEmptyQueueSubmit();

    expect(inputBox.events).toEqual(["clear"]);
    expect(activated).toBe(1);
    expect(screen.renders).toBe(1);
  });
});
