import type blessed from "blessed";

export type ControlDeckMode =
  | "assist"
  | "ecosystem"
  | "gateway"
  | "responses"
  | "jobs";

interface FooterUpdateOptions {
  flushForeign?: boolean;
  render?: boolean;
}

interface TuiControlDeckOptions {
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

interface TuiControlDeckController {
  renderCurrentControlDeck(): Promise<void>;
  renderAssistSuggestions(value: string): void;
  renderFooterContent(): string;
  setFooterHint(hint: string, options?: { render?: boolean }): void;
  startBusySpinner(): void;
  stopBusySpinner(): void;
  updateFooterHint(options?: FooterUpdateOptions): void;
}

function controlDeckLabel(mode: ControlDeckMode): string {
  switch (mode) {
    case "ecosystem":
      return " Control Deck · Ecosystem ";
    case "gateway":
      return " Control Deck · Gateway ";
    case "jobs":
      return " Control Deck · Jobs ";
    case "responses":
      return " Control Deck · Responses ";
    default:
      return " Control Deck · Assist ";
  }
}

export function installTuiControlDeck(
  options: TuiControlDeckOptions,
): TuiControlDeckController {
  const {
    screen,
    responsePane,
    activityPane,
    sidebarPane,
    assistBox,
    footer,
    inputBox,
    paletteList,
    getCurrentMode,
    isPaletteOpen,
    isComposerOpen,
    formatKeyLabel,
    flushDeferredForeignActivity,
    getBusyFrames,
    buildFooterContent,
    renderAssistSuggestionsContent,
    renderNonAssistControlDeckContent,
  } = options;
  let footerHint = "Esc input";
  let busyFrameIndex = 0;
  let busySpinnerTimer: ReturnType<typeof setInterval> | null = null;
  let renderToken = 0;

  const currentBusyFrame = (): string => {
    const frames = getBusyFrames();
    if (frames.length === 0) {
      return "•";
    }
    return frames[busyFrameIndex % frames.length] ?? "•";
  };

  const footerHintForCurrentFocus = (): string => {
    if (isComposerOpen()) {
      return formatKeyLabel("Ctrl-S submit draft");
    }
    if (isPaletteOpen()) {
      return screen.focused === paletteList
        ? "Enter run selected"
        : "Enter search top match";
    }
    if (screen.focused === inputBox) {
      return "Enter send  ↑/↓ history";
    }
    if (screen.focused === responsePane) {
      return formatKeyLabel("PgUp/PgDn scroll conversation");
    }
    if (screen.focused === activityPane) {
      return formatKeyLabel("PgUp/PgDn scroll ops log");
    }
    if (screen.focused === sidebarPane) {
      return "Enter sessions";
    }
    if (screen.focused === assistBox) {
      return getCurrentMode() === "assist"
        ? "Enter top suggestion"
        : getCurrentMode() === "gateway"
          ? "Enter gateway supervision"
          : getCurrentMode() === "ecosystem"
            ? "Enter runtime ecosystem"
            : getCurrentMode() === "jobs"
              ? "Enter background jobs"
              : "Enter responses list";
    }
    return "Esc input";
  };

  const renderFooterContent = (): string =>
    buildFooterContent(footerHint, currentBusyFrame());

  const updateFooterHint = (updateOptions?: FooterUpdateOptions): void => {
    if (updateOptions?.flushForeign !== false) {
      flushDeferredForeignActivity();
    }
    footerHint = footerHintForCurrentFocus();
    footer.setContent(renderFooterContent());
    if (updateOptions?.render !== false) {
      screen.render();
    }
  };

  const renderAssistSuggestions = (value: string): void => {
    if (getCurrentMode() !== "assist") {
      return;
    }
    renderToken += 1;
    assistBox.setLabel(controlDeckLabel("assist"));
    assistBox.setContent(renderAssistSuggestionsContent(value));
  };

  const renderCurrentControlDeck = async (): Promise<void> => {
    const mode = getCurrentMode();
    const token = ++renderToken;
    assistBox.setLabel(controlDeckLabel(mode));
    if (mode === "assist") {
      assistBox.setContent(renderAssistSuggestionsContent(inputBox.getValue()));
      return;
    }
    const content = await renderNonAssistControlDeckContent(mode);
    if (token !== renderToken || mode !== getCurrentMode()) {
      return;
    }
    assistBox.setContent(content);
  };

  const startBusySpinner = (): void => {
    if (busySpinnerTimer) {
      return;
    }
    busySpinnerTimer = setInterval(() => {
      const frames = getBusyFrames();
      busyFrameIndex =
        frames.length > 0 ? (busyFrameIndex + 1) % frames.length : 0;
      footer.setContent(renderFooterContent());
      screen.render();
    }, 120);
  };

  const stopBusySpinner = (): void => {
    if (!busySpinnerTimer) {
      return;
    }
    clearInterval(busySpinnerTimer);
    busySpinnerTimer = null;
    busyFrameIndex = 0;
  };

  const setFooterHint = (
    hint: string,
    setOptions?: {
      render?: boolean;
    },
  ): void => {
    footerHint = hint;
    if (setOptions?.render === false) {
      return;
    }
    footer.setContent(renderFooterContent());
    screen.render();
  };

  return {
    renderCurrentControlDeck,
    renderAssistSuggestions,
    renderFooterContent,
    setFooterHint,
    startBusySpinner,
    stopBusySpinner,
    updateFooterHint,
  };
}
