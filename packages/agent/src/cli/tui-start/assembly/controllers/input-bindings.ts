import { installTuiInputBindings } from "@/cli/tui-input-bindings";
import type {
  TuiStartCommandQueueController,
  TuiStartControllersOptions,
} from "./types";

export function installTuiStartInputBindings(
  options: TuiStartControllersOptions,
  commandQueue: TuiStartCommandQueueController,
): void {
  const { context, screen, tuiState, widgets, surfaces } = options;

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
