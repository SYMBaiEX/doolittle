import type blessed from "blessed";
import type { TuiOverlayState } from "../../tui-overlays";
import { installTuiOverlays } from "../../tui-overlays";
import type { TuiStateStore } from "../../tui-state";
import {
  createTuiTextEntryController,
  type InteractiveTextEntry,
} from "../../tui-text-entry";
import type { TuiWidgetSet } from "../../tui-widget-factory";
import type {
  TuiStartAssemblyHintOptions,
  TuiStartAssemblyState,
} from "../assembly-state";

interface TuiStartInputSetupOptions {
  workspaceDir: string;
  screen: blessed.Widgets.Screen;
  widgets: TuiWidgetSet;
  focusables: blessed.Widgets.BlessedElement[];
  tuiState: TuiStateStore;
  overlayState: TuiOverlayState;
  assemblyState: TuiStartAssemblyState;
}

export interface TuiStartInputSetupResult {
  activateTextEntry: (entry: InteractiveTextEntry) => void;
  deactivateTextEntry: (entry: InteractiveTextEntry) => void;
  focusPrimaryInput: () => void;
  focusProcessingSurface: () => void;
  hasLiveTextEntryCompletion: (entry: InteractiveTextEntry) => boolean;
  noteTextEntryActivity: () => void;
  textEntryFocused: () => boolean;
  overlays: ReturnType<typeof installTuiOverlays>;
}

export function createTuiStartInputSetup({
  workspaceDir,
  screen,
  widgets,
  focusables,
  tuiState,
  overlayState,
  assemblyState,
}: TuiStartInputSetupOptions): TuiStartInputSetupResult {
  const {
    paletteOverlay,
    paletteInput,
    paletteList,
    composerOverlay,
    composer,
    inputBox,
    response,
  } = widgets;

  const tuiTextEntry = createTuiTextEntryController({
    screen,
    state: tuiState,
    inputBox: inputBox as InteractiveTextEntry,
    composer: composer as InteractiveTextEntry,
    paletteInput: paletteInput as InteractiveTextEntry,
    responsePane: response,
    primaryFocusIndex: focusables.length - 1,
    renderScreen: () => {
      screen.render();
    },
    updateFooterHint: () => {
      assemblyState.updateFooterHint();
    },
    getLastTextEntryAt: () => tuiState.lastTextEntryAt,
    setLastTextEntryAt: (value) => {
      tuiState.lastTextEntryAt = value;
    },
  });

  const {
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    focusProcessingSurface,
    hasLiveTextEntryCompletion,
    noteTextEntryActivity,
    textEntryFocused,
  } = tuiTextEntry;

  const overlays = installTuiOverlays({
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
    updateFooterHint: (options?: TuiStartAssemblyHintOptions) => {
      assemblyState.updateFooterHint(options);
    },
    noteTextEntryActivity,
    queueCommand: (line) => {
      assemblyState.queueCommand(line);
    },
    screenRender: () => {
      screen.render();
    },
  });

  return {
    activateTextEntry,
    deactivateTextEntry,
    focusPrimaryInput,
    focusProcessingSurface,
    hasLiveTextEntryCompletion,
    noteTextEntryActivity,
    textEntryFocused,
    overlays,
  };
}
