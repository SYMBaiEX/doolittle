import { getCliHotkeyBindings } from "@/cli/command-surface";
import {
  canonicalizeSlashCommandSyntax,
  suggestCommands,
} from "@/runtime/command-catalog";
import { blockedByTextEntry } from "./guards";
import type { TuiScreenBindingsOptions } from "./types";

export function installActionBindings(opts: TuiScreenBindingsOptions): void {
  const {
    screen,
    inputBox,
    sidebar,
    assistBox,
    getControlDeckMode,
    queueCommand,
    workspaceDir,
    clearActivity,
    resetResponses,
    exportTranscript,
    refreshPanels,
    toggleOpsCollapsed,
  } = opts;

  screen.key(["C-t"], () => {
    if (blockedByTextEntry(opts)) return;
    queueCommand(canonicalizeSlashCommandSyntax("/theme next"));
  });
  screen.key(["C-y"], () => {
    if (blockedByTextEntry(opts)) return;
    queueCommand(canonicalizeSlashCommandSyntax("/theme prev"));
  });
  screen.key(["C-l"], () => {
    clearActivity();
    resetResponses();
    screen.render();
  });
  screen.key(["C-x"], () => exportTranscript());
  screen.key(["C-r"], () => void refreshPanels());
  screen.key(["C-o"], () => {
    if (blockedByTextEntry(opts)) return;
    toggleOpsCollapsed();
  });

  screen.key(["enter"], () => {
    if (blockedByTextEntry(opts)) return;
    if (screen.focused === sidebar) {
      queueCommand(canonicalizeSlashCommandSyntax("/sessions list"));
      return;
    }
    if (screen.focused !== assistBox) return;
    if (getControlDeckMode() === "assist") {
      const suggestion = suggestCommands(
        inputBox.getValue(),
        1,
        workspaceDir,
      )[0];
      if (suggestion) queueCommand(suggestion.command);
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
      if (blockedByTextEntry(opts)) return;
      queueCommand(command);
    });
  }
}
