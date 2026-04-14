import type blessed from "blessed";
import { suggestCommands } from "@/runtime/command-catalog";

interface PaletteSuggestionOptions {
  workspaceDir: string;
  query: string;
  paletteList: blessed.Widgets.ListElement;
  overlayState: {
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

interface ComposerBindingOptions {
  composer: blessed.Widgets.TextareaElement;
  closeComposer: () => void;
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
    closeComposer();
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
  paletteInput.on("keypress", () => {
    noteTextEntryActivity();
    syncPaletteSuggestions({
      workspaceDir,
      query: paletteInput.getValue(),
      paletteList,
      overlayState,
    });
    updateFooterHint({ flushForeign: false });
    screenRender();
  });

  paletteInput.key("enter", () => {
    const selected = readSelectedPaletteCommand(
      paletteInput.getValue(),
      workspaceDir,
      0,
    );
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected);
  });

  paletteList.key("enter", () => {
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
  });

  // "select item" fires for navigation and mouse hover, so only track focus here.
  paletteList.on("select item", (_, index) => {
    overlayState.paletteSelectionIndex = index;
  });

  for (const key of ["up", "down", "j", "k", "C-p", "C-n"]) {
    paletteList.key(key, () => {
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
    });
  }
}
