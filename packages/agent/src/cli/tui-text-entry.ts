import type blessed from "blessed";

export type InteractiveTextEntry = blessed.Widgets.TextboxElement &
  blessed.Widgets.TextareaElement & {
    _reading?: boolean;
    readInput?: () => void;
    cancel?: () => void;
  };

interface CreateTuiTextEntryControllerOptions {
  screen: blessed.Widgets.Screen;
  state: {
    busy: boolean;
    paletteOpen: boolean;
    composerOpen: boolean;
    focusIndex: number;
  };
  inputBox: InteractiveTextEntry;
  composer: InteractiveTextEntry;
  paletteInput: InteractiveTextEntry;
  responsePane: blessed.Widgets.BlessedElement;
  primaryFocusIndex: number;
  renderScreen(): void;
  updateFooterHint(): void;
  getLastTextEntryAt: () => number;
  setLastTextEntryAt: (value: number) => void;
}

interface TuiTextEntryController {
  activateTextEntry(entry: InteractiveTextEntry): void;
  deactivateTextEntry(entry: InteractiveTextEntry): void;
  focusPrimaryInput(): void;
  focusProcessingSurface(): void;
  hasLiveTextEntryCompletion(entry: InteractiveTextEntry): boolean;
  noteTextEntryActivity(): void;
  shouldDeferForeignActivity(): boolean;
  textEntryFocused(): boolean;
  textEntryRecentlyActive(): boolean;
}

export function createTuiTextEntryController(
  options: CreateTuiTextEntryControllerOptions,
): TuiTextEntryController {
  const {
    screen,
    state,
    inputBox,
    composer,
    paletteInput,
    responsePane,
    primaryFocusIndex,
    renderScreen,
    updateFooterHint,
    getLastTextEntryAt,
    setLastTextEntryAt,
  } = options;

  function isEntryReading(entry: InteractiveTextEntry): boolean {
    return entry._reading === true;
  }

  function hasLiveTextEntryCompletion(entry: InteractiveTextEntry): boolean {
    return typeof (entry as { _done?: unknown })._done === "function";
  }

  function noteTextEntryActivity(): void {
    setLastTextEntryAt(Date.now());
  }

  function activateTextEntry(entry: InteractiveTextEntry): void {
    if (screen.focused !== entry) {
      entry.focus();
    }
    if (!isEntryReading(entry)) {
      entry.readInput?.();
    }
    noteTextEntryActivity();
  }

  function deactivateTextEntry(entry: InteractiveTextEntry): void {
    if (isEntryReading(entry) && hasLiveTextEntryCompletion(entry)) {
      entry.cancel?.();
    }
  }

  function textEntryFocused(): boolean {
    return (
      screen.focused === inputBox ||
      screen.focused === composer ||
      screen.focused === paletteInput
    );
  }

  function textEntryRecentlyActive(): boolean {
    return Date.now() - getLastTextEntryAt() < 180;
  }

  function shouldDeferForeignActivity(): boolean {
    return (
      state.busy ||
      textEntryFocused() ||
      textEntryRecentlyActive() ||
      state.paletteOpen ||
      state.composerOpen
    );
  }

  function focusPrimaryInput(): void {
    state.focusIndex = primaryFocusIndex;
    activateTextEntry(inputBox);
    renderScreen();
  }

  function focusProcessingSurface(): void {
    deactivateTextEntry(inputBox);
    responsePane.focus();
    updateFooterHint();
    renderScreen();
  }

  return {
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    focusProcessingSurface,
    hasLiveTextEntryCompletion,
    noteTextEntryActivity,
    shouldDeferForeignActivity,
    textEntryFocused,
    textEntryRecentlyActive,
  };
}
