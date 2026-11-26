import { suggestCommands } from "@doolittle/agent/runtime/command-catalog";
import type blessed from "blessed";

interface PaletteSuggestionOptions {
  workspaceDir: string;
  query: string;
  paletteList: blessed.Widgets.ListElement;
  overlayState: {
    paletteOpen: boolean;
    paletteSelectionIndex: number;
  };
}

interface PaletteBindingOptions extends PaletteSuggestionOptions {
  paletteInput: blessed.Widgets.TextboxElement;
  noteTextEntryActivity: () => void;
  updateFooterHint: (options?: {
    flushForeign?: boolean;
    render?: boolean;
  }) => void;
  queueCommand: (line: string) => void;
  closePalette: () => void;
  screenRender: () => void;
}

interface ComposerCloseOptions {
  preserveDraft?: boolean;
}

interface ComposerBindingOptions {
  composer: blessed.Widgets.TextareaElement;
  closeComposer: (options?: ComposerCloseOptions) => void;
  queueCommand: (line: string) => void;
}

function readPaletteSuggestions(query: string, workspaceDir: string) {
  return suggestCommands(query, 12, workspaceDir);
}

function renderPaletteItems(query: string, workspaceDir: string): string[] {
  return readPaletteSuggestions(query, workspaceDir).map(
    (entry) => `{bold}${entry.command}{/bold} {gray-fg}[${entry.category}]{/}`,
  );
}

function readSelectedPaletteCommand(
  query: string,
  workspaceDir: string,
  selectionIndex: number,
): string | undefined {
  return readPaletteSuggestions(query, workspaceDir)[selectionIndex]?.command;
}

function getNextPaletteSelectionIndex(
  key: string,
  currentIndex: number,
  suggestionCount: number,
): number {
  if (key === "up" || key === "k" || key === "C-p") {
    return Math.max(0, currentIndex - 1);
  }
  return Math.min(suggestionCount - 1, currentIndex + 1);
}

function isPrintableInputChunk(chunk: string): boolean {
  if (chunk.length !== 1) {
    return true;
  }
  const code = chunk.charCodeAt(0);
  return !(
    code <= 8 ||
    code === 11 ||
    code === 12 ||
    (code >= 14 && code <= 31) ||
    code === 127
  );
}

export function syncPaletteSuggestions({
  workspaceDir,
  query,
  paletteList,
  overlayState,
}: PaletteSuggestionOptions): void {
  paletteList.setItems(renderPaletteItems(query, workspaceDir));
  overlayState.paletteSelectionIndex = 0;
  paletteList.select(0);
}

export function bindComposerOverlay({
  composer,
  closeComposer,
  queueCommand,
}: ComposerBindingOptions): void {
  composer.key("C-s", () => {
    const value = composer.getValue();
    closeComposer({ preserveDraft: false });
    queueCommand(value);
  });

  composer.key("escape", () => {
    closeComposer();
  });
}

export function bindPaletteOverlay({
  workspaceDir,
  paletteInput,
  paletteList,
  overlayState,
  noteTextEntryActivity,
  updateFooterHint,
  queueCommand,
  closePalette,
  screenRender,
}: PaletteBindingOptions): void {
  const runSelectedPaletteCommand = () => {
    const selected = readSelectedPaletteCommand(
      paletteInput.getValue(),
      workspaceDir,
      overlayState.paletteSelectionIndex,
    );
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected);
  };

  const movePaletteSelection = (key: string) => {
    const suggestions = readPaletteSuggestions(
      paletteInput.getValue(),
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
    const nextIndex = getNextPaletteSelectionIndex(
      key,
      overlayState.paletteSelectionIndex,
      suggestions.length,
    );
    overlayState.paletteSelectionIndex = nextIndex;
    paletteList.select(nextIndex);
    updateFooterHint();
    screenRender();
  };

  paletteInput.on("keypress", (ch, key) => {
    noteTextEntryActivity();
    const editsValue =
      key.name === "backspace" ||
      (typeof ch === "string" && ch.length > 0 && isPrintableInputChunk(ch));
    if (!editsValue) {
      return;
    }
    process.nextTick(() => {
      if (!overlayState.paletteOpen) {
        return;
      }
      syncPaletteSuggestions({
        workspaceDir,
        query: paletteInput.getValue(),
        paletteList,
        overlayState,
      });
      updateFooterHint({ flushForeign: false });
      screenRender();
    });
  });

  paletteInput.key("enter", runSelectedPaletteCommand);
  paletteList.key("enter", runSelectedPaletteCommand);

  // "select item" fires for navigation and mouse hover, so only track focus here.
  paletteList.on("select item", (_, index) => {
    overlayState.paletteSelectionIndex = index;
  });

  // Keep typing focus in the input while arrows move the match selection.
  for (const key of ["up", "down", "C-p", "C-n"]) {
    paletteInput.key(key, () => {
      movePaletteSelection(key);
    });
  }

  // Blessed lists already own arrows and vi j/k while the list is focused;
  // duplicating those keys here advances the selection twice. Keep only the
  // Emacs-style pair the native list does not handle.
  for (const key of ["C-p", "C-n"]) {
    paletteList.key(key, () => {
      movePaletteSelection(key);
    });
  }
}
