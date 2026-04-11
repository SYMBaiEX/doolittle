import { describe, expect, it } from "bun:test";
import { installTuiInputBindings } from "@/cli/tui-input-bindings";

function createInputBox(initialValue = "") {
  let value = initialValue;
  const events = new Map<string, (value?: string) => void>();
  const keys = new Map<string, () => void>();
  return {
    on(event: "submit" | "keypress", handler: (value?: string) => void) {
      events.set(event, handler);
    },
    key(key: string, handler: () => void) {
      keys.set(key, handler);
    },
    getValue() {
      return value;
    },
    setValue(next: string) {
      value = next;
    },
    emitSubmit(nextValue = value) {
      events.get("submit")?.(nextValue);
    },
    emitKeypress() {
      events.get("keypress")?.();
    },
    emitKey(key: string) {
      keys.get(key)?.();
    },
  };
}

describe("installTuiInputBindings", () => {
  it("queues submit and enter events while respecting live completion state", () => {
    const inputBox = createInputBox("hello");
    const queued: string[] = [];
    let liveCompletion = false;

    installTuiInputBindings({
      inputBox,
      workspaceDir: "/tmp",
      hasLiveTextEntryCompletion: () => liveCompletion,
      queueCommand: (line) => {
        queued.push(line);
      },
      hasHistory: () => false,
      historyBack: () => undefined,
      historyForward: () => undefined,
      noteTextEntryActivity: () => {},
      getControlDeckMode: () => "assist",
      renderAssistSuggestions: () => {},
      updateFooterHint: () => {},
      screenRender: () => {},
    });

    inputBox.emitSubmit();
    inputBox.emitKey("enter");
    liveCompletion = true;
    inputBox.emitKey("enter");

    expect(queued).toEqual(["hello", "hello"]);
  });

  it("uses history and updates assist suggestions while typing", () => {
    const inputBox = createInputBox("he");
    const assistSuggestions: string[] = [];
    const footerUpdates: Array<{ flushForeign?: boolean; render?: boolean }> =
      [];
    let renderCount = 0;
    const historyValue = "prior";

    installTuiInputBindings({
      inputBox,
      workspaceDir: "/tmp",
      hasLiveTextEntryCompletion: () => false,
      queueCommand: () => {},
      hasHistory: () => true,
      historyBack: () => historyValue,
      historyForward: () => "",
      noteTextEntryActivity: () => {},
      getControlDeckMode: () => "assist",
      renderAssistSuggestions: (value) => {
        assistSuggestions.push(value);
      },
      updateFooterHint: (options) => {
        footerUpdates.push(options ?? {});
      },
      screenRender: () => {
        renderCount += 1;
      },
    });

    inputBox.emitKey("up");
    expect(inputBox.getValue()).toBe("prior");
    inputBox.setValue("typed");
    inputBox.emitKeypress();

    expect(assistSuggestions).toEqual(["prior", "typed"]);
    expect(footerUpdates).toEqual([{ flushForeign: false, render: false }]);
    expect(renderCount).toBe(2);
  });
});
