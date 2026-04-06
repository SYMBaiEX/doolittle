interface InputLifecycleNode {
  clearValue: () => void;
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
      inputBox.clearValue();
      renderAssistSuggestions("");
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
