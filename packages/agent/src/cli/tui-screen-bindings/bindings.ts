import { getCliHotkeyBindings } from "@/cli/command-surface";
import type { ControlDeckMode } from "@/cli/tui-control-deck";
import {
  canonicalizeSlashCommandSyntax,
  suggestCommands,
} from "@/runtime/command-catalog";
import type {
  FocusableTarget,
  ScreenBindingTarget,
  TuiScreenBindingsOptions,
} from "./types";

export type {
  FocusableTarget,
  ScreenBindingTarget,
  TuiScreenBindingsOptions,
} from "./types";

function installKeyBindings(options: {
  screen: ScreenBindingTarget;
  inputBox: { getValue(): string };
  response: FocusableTarget;
  activity: FocusableTarget;
  sidebar: FocusableTarget;
  assistBox: FocusableTarget;
  paletteInput: unknown;
  paletteList: FocusableTarget;
  focusables: FocusableTarget[];
  getFocusIndex: () => number;
  setFocusIndex: (value: number) => void;
  activateTextEntry: (entry: unknown) => void;
  deactivateTextEntry: (entry: unknown) => void;
  textEntryFocused: () => boolean;
  isPaletteOpen: () => boolean;
  isComposerOpen: () => boolean;
  getControlDeckMode: () => ControlDeckMode;
  setControlDeckMode: (mode: ControlDeckMode) => void;
  refreshPanels: () => Promise<void>;
  updateFooterHint: () => void;
  queueCommand: (line: string) => void;
  workspaceDir: string;
  lifecycle: {
    exitCli: () => void;
    handleSigint: () => void;
  };
  overlays: {
    openPalette(initialValue?: string): void;
    openComposer(initialValue?: string): void;
    closePalette(): void;
    closeComposer(): void;
  };
  clearActivity: () => void;
  resetResponses: () => void;
  exportTranscript: () => void;
  toggleOpsCollapsed: () => void;
}): void {
  const {
    screen,
    inputBox,
    response,
    activity,
    sidebar,
    assistBox,
    paletteInput,
    paletteList,
    focusables,
    getFocusIndex,
    setFocusIndex,
    activateTextEntry,
    deactivateTextEntry,
    textEntryFocused,
    isPaletteOpen,
    isComposerOpen,
    getControlDeckMode,
    setControlDeckMode,
    refreshPanels,
    updateFooterHint,
    queueCommand,
    workspaceDir,
    lifecycle,
    overlays,
    clearActivity,
    resetResponses,
    exportTranscript,
    toggleOpsCollapsed,
  } = options;

  const blockedByTextEntry = (): boolean =>
    textEntryFocused() || isPaletteOpen() || isComposerOpen();

  const syncFocusIndexFromCurrentFocus = (): void => {
    const current = screen.focused
      ? focusables.indexOf(screen.focused as FocusableTarget)
      : -1;
    if (current >= 0) {
      setFocusIndex(current);
    }
  };

  const focusAt = (index: number): void => {
    syncFocusIndexFromCurrentFocus();
    const nextIndex = (index + focusables.length) % focusables.length;
    setFocusIndex(nextIndex);
    const nextTarget = focusables[nextIndex];
    if (nextTarget === inputBox) {
      activateTextEntry(inputBox);
    } else {
      nextTarget?.focus?.();
    }
    screen.render();
  };

  const scrollFocusedPane = (delta: number): void => {
    const target =
      screen.focused === response
        ? response
        : screen.focused === sidebar
          ? sidebar
          : screen.focused === assistBox
            ? assistBox
            : activity;
    target.scroll?.(delta);
    screen.render();
  };

  const setDeckMode = (mode: ControlDeckMode): void => {
    if (blockedByTextEntry()) {
      return;
    }
    setControlDeckMode(mode);
    void refreshPanels();
  };

  screen.key(["C-q"], () => {
    lifecycle.exitCli();
  });
  screen.key(["C-c"], () => {
    lifecycle.handleSigint();
  });
  screen.key(["q"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    lifecycle.exitCli();
  });
  screen.key(["C-p"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    overlays.openPalette(inputBox.getValue());
  });
  screen.key(["C-g"], () => {
    setDeckMode("gateway");
  });
  screen.key(["C-b"], () => {
    setDeckMode("jobs");
  });
  screen.key(["C-e"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    overlays.openComposer(inputBox.getValue());
  });
  screen.key(["C-s"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    response.focus?.();
    screen.render();
  });
  screen.key(["C-t"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    queueCommand(canonicalizeSlashCommandSyntax("/theme next"));
  });
  screen.key(["C-y"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    queueCommand(canonicalizeSlashCommandSyntax("/theme prev"));
  });
  screen.key(["tab"], () => {
    if (isComposerOpen()) {
      return;
    }
    if (screen.focused === inputBox) {
      return;
    }
    if (isPaletteOpen()) {
      deactivateTextEntry(paletteInput);
      paletteList.focus?.();
      updateFooterHint();
      screen.render();
      return;
    }
    focusAt(getFocusIndex() + 1);
  });
  screen.key(["S-tab"], () => {
    if (isComposerOpen()) {
      return;
    }
    if (screen.focused === inputBox) {
      return;
    }
    if (isPaletteOpen()) {
      activateTextEntry(paletteInput);
      updateFooterHint();
      screen.render();
      return;
    }
    focusAt(getFocusIndex() - 1);
  });
  screen.key(["escape"], () => {
    if (isComposerOpen()) {
      overlays.closeComposer();
      return;
    }
    if (isPaletteOpen()) {
      overlays.closePalette();
      return;
    }
    activateTextEntry(inputBox);
    updateFooterHint();
    screen.render();
  });
  screen.key(["C-l"], () => {
    clearActivity();
    resetResponses();
    screen.render();
  });
  screen.key(["C-x"], () => {
    exportTranscript();
  });
  screen.key(["C-r"], () => {
    void refreshPanels();
  });
  screen.key(["C-o"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    toggleOpsCollapsed();
  });
  screen.key(["M-1"], () => {
    setDeckMode("assist");
  });
  screen.key(["M-2"], () => {
    setDeckMode("ecosystem");
  });
  screen.key(["M-3"], () => {
    setDeckMode("gateway");
  });
  screen.key(["M-4"], () => {
    setDeckMode("responses");
  });
  screen.key(["M-5"], () => {
    setDeckMode("jobs");
  });
  screen.key(["pageup"], () => {
    scrollFocusedPane(-8);
  });
  screen.key(["pagedown"], () => {
    scrollFocusedPane(8);
  });
  screen.key(["C-u"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    scrollFocusedPane(-8);
  });
  screen.key(["C-d"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    scrollFocusedPane(8);
  });
  screen.key(["enter"], () => {
    if (blockedByTextEntry()) {
      return;
    }
    if (screen.focused === sidebar) {
      queueCommand(canonicalizeSlashCommandSyntax("/sessions list"));
      return;
    }
    if (screen.focused !== assistBox) {
      return;
    }
    if (getControlDeckMode() === "assist") {
      const suggestion = suggestCommands(
        inputBox.getValue(),
        1,
        workspaceDir,
      )[0];
      if (suggestion) {
        queueCommand(suggestion.command);
      }
      return;
    }
    if (getControlDeckMode() === "ecosystem") {
      queueCommand(canonicalizeSlashCommandSyntax("/runtime ecosystem"));
      return;
    }
    if (getControlDeckMode() === "gateway") {
      queueCommand(canonicalizeSlashCommandSyntax("/gateway supervision"));
      return;
    }
    if (getControlDeckMode() === "jobs") {
      queueCommand(canonicalizeSlashCommandSyntax("/jobs"));
      return;
    }
    queueCommand(canonicalizeSlashCommandSyntax("/responses list"));
  });

  for (const { keys, command } of getCliHotkeyBindings()) {
    screen.key(keys, () => {
      if (blockedByTextEntry()) {
        return;
      }
      queueCommand(command);
    });
  }
}

export function installTuiScreenBindings(
  options: TuiScreenBindingsOptions,
): void {
  installKeyBindings(options);
}
