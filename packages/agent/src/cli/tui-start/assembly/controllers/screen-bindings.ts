import { installTuiScreenBindings } from "@/cli/tui-screen-bindings";
import type {
  TuiStartControllersOptions,
  TuiStartLifecycleController,
} from "./types";

export function installTuiStartScreenBindings(
  options: TuiStartControllersOptions,
  lifecycle: TuiStartLifecycleController,
): void {
  const { context, tuiState, widgets, focusables, surfaces } = options;

  installTuiScreenBindings({
    screen: options.screen,
    inputBox: widgets.inputBox,
    response: widgets.response,
    activity: widgets.activity,
    sidebar: widgets.sidebar,
    assistBox: widgets.assistBox,
    paletteInput: widgets.paletteInput,
    paletteList: widgets.paletteList,
    focusables,
    getFocusIndex: () => tuiState.focusIndex,
    setFocusIndex: (value: number) => {
      tuiState.focusIndex = value;
    },
    activateTextEntry: (entry: unknown) => {
      surfaces.activateTextEntry(entry as never);
    },
    deactivateTextEntry: (entry: unknown) => {
      surfaces.deactivateTextEntry(entry as never);
    },
    textEntryFocused: () => surfaces.textEntryFocused(),
    isPaletteOpen: () => tuiState.paletteOpen,
    isComposerOpen: () => tuiState.composerOpen,
    getControlDeckMode: () => tuiState.controlDeckMode,
    setControlDeckMode: (
      mode: "assist" | "gateway" | "jobs" | "ecosystem" | "responses",
    ) => {
      tuiState.controlDeckMode = mode;
    },
    refreshPanels: surfaces.refreshPanels,
    updateFooterHint: () => {
      surfaces.updateFooterHint();
    },
    queueCommand: surfaces.assemblyState.queueCommand,
    workspaceDir: context.config.workspaceDir,
    lifecycle: {
      exitCli: () => {
        lifecycle.exitCli();
      },
      handleSigint: () => {
        lifecycle.handleSigint();
      },
    },
    overlays: surfaces.overlays,
    clearActivity: () => {
      widgets.activity.setContent("");
    },
    resetResponses: surfaces.resetResponses,
    exportTranscript: surfaces.exportTranscript,
    toggleOpsCollapsed: () => {
      tuiState.opsCollapsed = !tuiState.opsCollapsed;
      surfaces.syncLayout();
      surfaces.updateFooterHint();
    },
  });
}
