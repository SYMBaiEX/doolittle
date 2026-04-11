import type { ControlDeckMode } from "@/cli/tui-control-deck";

export interface FocusableTarget {
  focus?: () => void;
  scroll?: (delta: number) => void;
  setContent?: (content: string) => void;
}

export interface ScreenBindingTarget {
  focused?: unknown;
  key(keys: string[], handler: () => void): void;
  render(): void;
}

export interface TuiScreenBindingsOptions {
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
}
