import type blessed from "blessed";

export type ControlDeckMode =
  | "assist"
  | "ecosystem"
  | "gateway"
  | "responses"
  | "jobs";

export interface FooterUpdateOptions {
  flushForeign?: boolean;
  render?: boolean;
}

export interface TuiControlDeckOptions {
  screen: blessed.Widgets.Screen;
  responsePane: blessed.Widgets.BlessedElement;
  activityPane: blessed.Widgets.BlessedElement;
  sidebarPane: blessed.Widgets.BlessedElement;
  assistBox: {
    setLabel(label: string): void;
    setContent(content: string): void;
  };
  footer: {
    setContent(content: string): void;
  };
  inputBox: blessed.Widgets.TextboxElement;
  paletteList: blessed.Widgets.ListElement;
  getCurrentMode: () => ControlDeckMode;
  isPaletteOpen: () => boolean;
  isComposerOpen: () => boolean;
  formatKeyLabel: (label: string) => string;
  flushDeferredForeignActivity: () => void;
  getBusyFrames: () => string[];
  buildFooterContent: (hint: string, busyFrame: string) => string;
  renderAssistSuggestionsContent: (value: string) => string;
  renderNonAssistControlDeckContent: (
    mode: Exclude<ControlDeckMode, "assist">,
  ) => Promise<string>;
}

export interface TuiControlDeckController {
  renderCurrentControlDeck(): Promise<void>;
  renderAssistSuggestions(value: string): void;
  renderFooterContent(): string;
  setFooterHint(hint: string, options?: { render?: boolean }): void;
  startBusySpinner(): void;
  stopBusySpinner(): void;
  updateFooterHint(options?: FooterUpdateOptions): void;
}

export interface TuiControlDeckState {
  footerHint: string;
  busyFrameIndex: number;
  busySpinnerTimer: ReturnType<typeof setInterval> | null;
  renderToken: number;
}
