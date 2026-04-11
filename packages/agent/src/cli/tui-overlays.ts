import type blessed from "blessed";
import { suggestCommands } from "@/runtime/command-catalog";

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

  const renderPaletteItems = (query: string): string[] =>
    suggestCommands(query, 12, workspaceDir).map(
      (entry) =>
        `{bold}${entry.command}{/bold} {gray-fg}[${entry.category}]{/}`,
    );

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
    paletteList.setItems(renderPaletteItems(preservedValue));
    overlayState.paletteSelectionIndex = 0;
    paletteList.select(0);
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

  composer.key("C-s", () => {
    const value = composer.getValue();
    closeComposer();
    queueCommand(value);
  });

  composer.key("escape", () => {
    closeComposer();
  });

  paletteInput.on("keypress", () => {
    noteTextEntryActivity();
    const query = paletteInput.getValue();
    paletteList.setItems(renderPaletteItems(query));
    overlayState.paletteSelectionIndex = 0;
    paletteList.select(0);
    updateFooterHint({ flushForeign: false });
    screenRender();
  });

  paletteInput.key("enter", () => {
    const selected = suggestCommands(
      paletteInput.getValue(),
      1,
      workspaceDir,
    )[0];
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected.command);
  });

  paletteList.key("enter", () => {
    const selected = suggestCommands(paletteInput.getValue(), 12, workspaceDir)[
      overlayState.paletteSelectionIndex
    ];
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected.command);
  });

  // "select item" fires for navigation and mouse hover, so only track focus here.
  paletteList.on("select item", (_, index) => {
    overlayState.paletteSelectionIndex = index;
  });
  for (const key of ["up", "down", "j", "k", "C-p", "C-n"]) {
    paletteList.key(key, () => {
      const suggestions = suggestCommands(
        paletteInput.getValue(),
        12,
        workspaceDir,
      );
      const current = suggestions[overlayState.paletteSelectionIndex];
      if (!current) {
        overlayState.paletteSelectionIndex = 0;
        paletteList.select(0);
        updateFooterHint();
        screenRender();
        return;
      }
      const nextIndex =
        key === "up" || key === "k" || key === "C-p"
          ? Math.max(0, overlayState.paletteSelectionIndex - 1)
          : Math.min(
              suggestions.length - 1,
              overlayState.paletteSelectionIndex + 1,
            );
      overlayState.paletteSelectionIndex = nextIndex;
      paletteList.select(nextIndex);
      updateFooterHint();
      screenRender();
    });
  }

  return {
    openPalette,
    closePalette,
    openComposer,
    closeComposer,
  };
}
