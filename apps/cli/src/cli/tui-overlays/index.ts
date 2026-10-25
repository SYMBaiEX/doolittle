import type blessed from "blessed";
import {
  bindComposerOverlay,
  bindPaletteOverlay,
  syncPaletteSuggestions,
} from "./bindings";

type InteractiveTextEntry = blessed.Widgets.TextboxElement &
  blessed.Widgets.TextareaElement & {
    _reading?: boolean;
    readInput?: () => void;
    cancel?: () => void;
  };

export interface TuiOverlayState {
  paletteOpen: boolean;
  composerOpen: boolean;
  paletteSelectionIndex: number;
}

interface TuiOverlayOptions {
  workspaceDir: string;
  paletteOverlay: blessed.Widgets.BoxElement;
  paletteInput: blessed.Widgets.TextboxElement;
  paletteList: blessed.Widgets.ListElement;
  composerOverlay: blessed.Widgets.BoxElement;
  composer: blessed.Widgets.TextareaElement;
  inputBox: blessed.Widgets.TextboxElement;
  overlayState: TuiOverlayState;
  activateTextEntry: (entry: InteractiveTextEntry) => void;
  deactivateTextEntry: (entry: InteractiveTextEntry) => void;
  focusPrimaryInput: () => void;
  updateFooterHint: (options?: {
    flushForeign?: boolean;
    render?: boolean;
  }) => void;
  noteTextEntryActivity: () => void;
  queueCommand: (line: string) => void;
  screenRender: () => void;
}

interface TuiOverlayController {
  openPalette(initialValue?: string): void;
  closePalette(): void;
  openComposer(initialValue?: string): void;
  closeComposer(): void;
}

export function installTuiOverlays(
  options: TuiOverlayOptions,
): TuiOverlayController {
  const {
    workspaceDir,
    paletteOverlay,
    paletteInput,
    paletteList,
    composerOverlay,
    composer,
    inputBox,
    overlayState,
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    updateFooterHint,
    noteTextEntryActivity,
    queueCommand,
    screenRender,
  } = options;

  const closePalette = () => {
    deactivateTextEntry(paletteInput as InteractiveTextEntry);
    overlayState.paletteOpen = false;
    paletteOverlay.hide();
    paletteInput.clearValue();
    paletteList.setItems([]);
    focusPrimaryInput();
    updateFooterHint();
  };

  const closeComposer = () => {
    deactivateTextEntry(composer as InteractiveTextEntry);
    overlayState.composerOpen = false;
    composerOverlay.hide();
    composer.clearValue();
    focusPrimaryInput();
    updateFooterHint();
  };

  const openPalette = (initialValue = "") => {
    const preservedValue = overlayState.composerOpen
      ? composer.getValue()
      : initialValue;
    if (overlayState.composerOpen) {
      closeComposer();
    }
    deactivateTextEntry(inputBox as InteractiveTextEntry);
    overlayState.paletteOpen = true;
    paletteOverlay.show();
    paletteInput.setValue(preservedValue);
    syncPaletteSuggestions({
      workspaceDir,
      query: preservedValue,
      paletteList,
      overlayState,
    });
    activateTextEntry(paletteInput as InteractiveTextEntry);
    updateFooterHint();
    screenRender();
  };

  const openComposer = (initialValue = "") => {
    const preservedValue = overlayState.paletteOpen
      ? paletteInput.getValue()
      : initialValue;
    if (overlayState.paletteOpen) {
      closePalette();
    }
    deactivateTextEntry(inputBox as InteractiveTextEntry);
    overlayState.composerOpen = true;
    composerOverlay.show();
    composer.setValue(preservedValue);
    activateTextEntry(composer as InteractiveTextEntry);
    updateFooterHint();
    screenRender();
  };

  bindComposerOverlay({
    composer,
    closeComposer,
    queueCommand,
  });

  bindPaletteOverlay({
    workspaceDir,
    query: paletteInput.getValue(),
    paletteInput,
    paletteList,
    overlayState,
    noteTextEntryActivity,
    updateFooterHint,
    queueCommand,
    closePalette,
    screenRender,
  });

  return {
    openPalette,
    closePalette,
    openComposer,
    closeComposer,
  };
}
