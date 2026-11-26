import type { ControlDeckMode } from "./tui-control-deck/index";

interface InputBindingTarget {
  on(event: "submit" | "keypress", handler: (value?: string) => void): void;
  key(key: string, handler: () => void): void;
  getValue(): string;
  setValue(value: string): void;
  screen?: {
    focused?: unknown;
  };
}

interface TuiInputBindingsOptions {
  inputBox: InputBindingTarget;
  workspaceDir: string;
  hasLiveTextEntryCompletion: (entry: unknown) => boolean;
  queueCommand: (line: string) => void;
  hasHistory: () => boolean;
  historyBack: () => string | undefined;
  historyForward: () => string | undefined;
  noteTextEntryActivity: () => void;
  getControlDeckMode: () => ControlDeckMode;
  renderAssistSuggestions: (value: string) => void;
  updateFooterHint: (options?: {
    flushForeign?: boolean;
    render?: boolean;
  }) => void;
  screenRender: () => void;
}

export function installTuiInputBindings(
  options: TuiInputBindingsOptions,
): void {
  const {
    inputBox,
    queueCommand,
    hasHistory,
    historyBack,
    historyForward,
    noteTextEntryActivity,
    getControlDeckMode,
    renderAssistSuggestions,
    updateFooterHint,
    screenRender,
  } = options;

  const setInputValue = (value: string): void => {
    noteTextEntryActivity();
    inputBox.setValue(value);
    renderAssistSuggestions(value);
    screenRender();
  };

  // Enter has exactly one owner: blessed emits submit only while this textbox
  // owns an active read. A key-level fallback runs after that submit and can
  // queue a second empty line after the input is cleared.
  inputBox.on("submit", (value) => {
    queueCommand(value ?? inputBox.getValue());
  });

  const inputOwnsKey = () => inputBox.screen?.focused === inputBox;
  const whenInputFocused = (handler: () => void) => () => {
    if (!inputOwnsKey()) {
      return;
    }
    handler();
  };

  inputBox.key(
    "up",
    whenInputFocused(() => {
      if (!hasHistory()) {
        return;
      }
      setInputValue(historyBack() ?? "");
    }),
  );

  inputBox.key(
    "down",
    whenInputFocused(() => {
      if (!hasHistory()) {
        return;
      }
      setInputValue(historyForward() ?? "");
    }),
  );

  inputBox.on("keypress", () => {
    noteTextEntryActivity();
    if (getControlDeckMode() === "assist") {
      renderAssistSuggestions(inputBox.getValue());
      updateFooterHint({ flushForeign: false, render: false });
      screenRender();
    }
  });
}
