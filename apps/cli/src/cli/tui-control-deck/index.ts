import { renderFooterContent, setFooterHint, updateFooterHint } from "./footer";
import { renderAssistSuggestions, renderCurrentControlDeck } from "./render";
import { startBusySpinner, stopBusySpinner } from "./spinner";
import type {
  ControlDeckMode,
  TuiControlDeckController,
  TuiControlDeckOptions,
  TuiControlDeckState,
} from "./types";

export type { ControlDeckMode };

export function installTuiControlDeck(
  options: TuiControlDeckOptions,
): TuiControlDeckController {
  const state: TuiControlDeckState = {
    footerHint: "Esc input",
    busyFrameIndex: 0,
    busySpinnerTimer: null,
    renderToken: 0,
  };

  return {
    renderCurrentControlDeck: () => renderCurrentControlDeck(options, state),
    renderAssistSuggestions: (value) =>
      renderAssistSuggestions(options, state, value),
    renderFooterContent: () => renderFooterContent(options, state),
    setFooterHint: (hint, setOptions) =>
      setFooterHint(options, state, hint, setOptions),
    startBusySpinner: () => startBusySpinner(options, state),
    stopBusySpinner: () => stopBusySpinner(state),
    updateFooterHint: (updateOptions) =>
      updateFooterHint(options, state, updateOptions),
  };
}
