import { stdout } from "node:process";
import { normalizeSlashCommandSyntax } from "@doolittle/agent/runtime/command-catalog";
import type blessed from "blessed";
import { rankCliCommandCatalogEntries } from "../command-surface";
import { escapeBlessed } from "../render-utils";

interface PaletteSuggestionOptions {
  workspaceDir?: string;
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

function readPaletteSuggestions(query: string, workspaceDir?: string) {
  return rankCliCommandCatalogEntries(query, 12, workspaceDir);
}

function resolveDefaultPaletteContentWidth(): number {
  const columns = stdout.columns ?? 80;
  const overlayRatio = columns < 110 ? 0.94 : columns < 140 ? 0.82 : 0.72;
  return Math.max(24, Math.floor(columns * overlayRatio) - 6);
}

function clipInline(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (text.length <= width) {
    return text;
  }
  if (width === 1) {
    return "…";
  }
  return `${text.slice(0, width - 1)}…`;
}

/**
 * Rows carry a textual selection marker so the active row never depends on
 * color alone: the selection background is a theme accent surface, and color
 * is not an accessible signal by itself. The category suffix stays untinted
 * because tagged colors would keep their low-contrast foreground when the row
 * inverts onto the contrast selection surface.
 */
export function renderPaletteItems(
  query: string,
  workspaceDir?: string,
  selectedIndex = 0,
  width = resolveDefaultPaletteContentWidth(),
): string[] {
  return readPaletteSuggestions(query, workspaceDir).map((entry, index) => {
    const marker = index === selectedIndex ? ">" : " ";
    const rowWidth = width - 2;
    const category = ` [${escapeBlessed(entry.category)}]`;
    const displayCommand = normalizeSlashCommandSyntax(entry.command);
    const commandWidth = rowWidth - category.length;
    const compactCommand = clipInline(
      displayCommand,
      Math.max(1, commandWidth),
    );
    const command = `{bold}${escapeBlessed(compactCommand)}{/bold}`;
    if (width < 52) {
      return `${marker} ${command}${category}`;
    }

    const descriptionWidth = Math.max(
      0,
      rowWidth - compactCommand.length - category.length - 1,
    );
    const description = clipInline(entry.description, descriptionWidth);
    return description
      ? `${marker} ${command} ${escapeBlessed(description)}${category}`
      : `${marker} ${command}${category}`;
  });
}

function readSelectedPaletteCommand(
  query: string,
  workspaceDir: string | undefined,
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
  overlayState.paletteSelectionIndex = 0;
  paletteList.setItems(renderPaletteItems(query, workspaceDir, 0));
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
    paletteList.setItems(
      renderPaletteItems(paletteInput.getValue(), workspaceDir, nextIndex),
    );
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
