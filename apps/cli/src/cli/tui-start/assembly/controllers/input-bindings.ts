import { installTuiInputBindings } from "../../../tui-input-bindings";
import { installTuiTypeAhead } from "../../../tui-type-ahead";
import type {
  TuiStartCommandQueueController,
  TuiStartControllersOptions,
} from "./types";

export function installTuiStartInputBindings(
  options: TuiStartControllersOptions,
  commandQueue: TuiStartCommandQueueController,
): void {
  const { context, screen, tuiState, widgets, surfaces } = options;

  installTuiTypeAhead({
    screen: screen as never,
    inputBox: widgets.inputBox as never,
    paletteInput: widgets.paletteInput as never,
    composer: widgets.composer as never,
    textEntries: [
      widgets.inputBox,
      widgets.composer,
      widgets.paletteInput,
    ] as never[],
    activateTextEntry: (entry) => {
      surfaces.activateTextEntry(entry as never);
    },
    isPaletteOpen: () => tuiState.paletteOpen,
    isComposerOpen: () => tuiState.composerOpen,
  });

  installTuiInputBindings({
    inputBox: widgets.inputBox,
    workspaceDir: context.config.workspaceDir,
    hasLiveTextEntryCompletion: (entry: unknown) =>
      surfaces.hasLiveTextEntryCompletion(entry as never),
    queueCommand: (line: string) => {
      surfaces.assemblyState.queueCommand(line);
    },
    hasHistory: () => commandQueue.hasHistory(),
    historyBack: () => commandQueue.historyBack(),
    historyForward: () => commandQueue.historyForward(),
    noteTextEntryActivity: surfaces.noteTextEntryActivity,
    getControlDeckMode: () => tuiState.controlDeckMode,
    renderAssistSuggestions: (value: string) => {
      surfaces.renderAssistSuggestions(value);
    },
    updateFooterHint: () => {
      surfaces.updateFooterHint();
    },
    screenRender: () => {
      screen.render();
    },
  });
}
