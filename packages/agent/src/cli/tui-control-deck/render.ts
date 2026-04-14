import { controlDeckLabel } from "./label";
import type { TuiControlDeckOptions, TuiControlDeckState } from "./types";

export function renderAssistSuggestions(
  options: Pick<
    TuiControlDeckOptions,
    "assistBox" | "getCurrentMode" | "renderAssistSuggestionsContent"
  >,
  state: TuiControlDeckState,
  value: string,
): void {
  if (options.getCurrentMode() !== "assist") {
    return;
  }
  state.renderToken += 1;
  options.assistBox.setLabel(controlDeckLabel("assist"));
  options.assistBox.setContent(options.renderAssistSuggestionsContent(value));
}

export async function renderCurrentControlDeck(
  options: Pick<
    TuiControlDeckOptions,
    | "assistBox"
    | "inputBox"
    | "getCurrentMode"
    | "renderAssistSuggestionsContent"
    | "renderNonAssistControlDeckContent"
  >,
  state: TuiControlDeckState,
): Promise<void> {
  const mode = options.getCurrentMode();
  const token = ++state.renderToken;
  options.assistBox.setLabel(controlDeckLabel(mode));
  if (mode === "assist") {
    options.assistBox.setContent(
      options.renderAssistSuggestionsContent(options.inputBox.getValue()),
    );
    return;
  }
  const content = await options.renderNonAssistControlDeckContent(mode);
  if (token !== state.renderToken || mode !== options.getCurrentMode()) {
    return;
  }
  options.assistBox.setContent(content);
}
