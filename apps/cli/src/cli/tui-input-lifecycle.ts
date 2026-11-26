interface InputLifecycleNode {
  clearValue: () => void;
  getValue?: () => string;
}

interface TuiInputLifecycleScreen {
  render: () => void;
}

interface TuiInputLifecycleOptions {
  inputBox: InputLifecycleNode;
  activateTextEntry: () => void;
  screen: TuiInputLifecycleScreen;
  refreshPanels: () => Promise<void>;
  renderAssistSuggestions: (value: string) => void;
  updateFooterHint: () => void;
}

interface TuiInputLifecycleController {
  resetInputAfterQueue: () => void;
  restoreInputAfterRun: () => Promise<void>;
  handleEmptyQueueSubmit: () => void;
}

export function installTuiInputLifecycle(
  options: TuiInputLifecycleOptions,
): TuiInputLifecycleController {
  const {
    inputBox,
    activateTextEntry,
    screen,
    refreshPanels,
    renderAssistSuggestions,
    updateFooterHint,
  } = options;

  return {
    resetInputAfterQueue: () => {
      inputBox.clearValue();
      renderAssistSuggestions("");
      screen.render();
    },
    restoreInputAfterRun: async () => {
      await refreshPanels();
      // The submitted line was already cleared when it entered the queue. Any
      // text present here is a user draft written during the busy turn, so the
      // lifecycle must not treat it as disposable input chrome state.
      const draft = inputBox.getValue?.() ?? "";
      renderAssistSuggestions(draft);
      activateTextEntry();
      updateFooterHint();
      screen.render();
    },
    handleEmptyQueueSubmit: () => {
      inputBox.clearValue();
      activateTextEntry();
      screen.render();
    },
  };
}

export type { TuiInputLifecycleController, TuiInputLifecycleOptions };
