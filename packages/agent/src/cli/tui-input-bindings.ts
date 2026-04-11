import type { ControlDeckMode } from "@/cli/tui-control-deck";
import { suggestCommands } from "@/runtime/command-catalog";

interface InputBindingTarget {
  on(event: "submit" | "keypress", handler: (value?: string) => void): void;
  key(key: string, handler: () => void): void;
  getValue(): string;
  setValue(value: string): void;
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
    workspaceDir,
    hasLiveTextEntryCompletion,
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

  inputBox.on("submit", (value) => {
    queueCommand(value ?? inputBox.getValue());
  });

  inputBox.key("enter", () => {
    if (hasLiveTextEntryCompletion(inputBox)) {
      return;
    }
    queueCommand(inputBox.getValue());
  });

  inputBox.key("up", () => {
    if (!hasHistory()) {
      return;
    }
    setInputValue(historyBack() ?? "");
  });

  inputBox.key("down", () => {
    if (!hasHistory()) {
      return;
    }
    setInputValue(historyForward() ?? "");
  });

  inputBox.key("C-p", () => {
    if (!hasHistory()) {
      return;
    }
    setInputValue(historyBack() ?? "");
  });

  inputBox.key("C-n", () => {
    if (!hasHistory()) {
      return;
    }
    setInputValue(historyForward() ?? "");
  });

  inputBox.key("tab", () => {
    const suggestion = suggestCommands(inputBox.getValue(), 1, workspaceDir)[0];
    if (!suggestion) {
      return;
    }
    setInputValue(suggestion.command);
  });

  inputBox.on("keypress", () => {
    noteTextEntryActivity();
    if (getControlDeckMode() === "assist") {
      renderAssistSuggestions(inputBox.getValue());
      updateFooterHint({ flushForeign: false, render: false });
      screenRender();
    }
  });
}
