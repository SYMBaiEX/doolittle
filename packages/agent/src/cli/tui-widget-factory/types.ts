import type blessed from "blessed";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export interface TuiWidgetSet {
  header: blessed.Widgets.BoxElement;
  activity: blessed.Widgets.Log;
  response: blessed.Widgets.BoxElement;
  sidebar: blessed.Widgets.BoxElement;
  transportBox: blessed.Widgets.BoxElement;
  executionBox: blessed.Widgets.BoxElement;
  assistBox: blessed.Widgets.BoxElement;
  paletteOverlay: blessed.Widgets.BoxElement;
  paletteInput: blessed.Widgets.TextboxElement;
  paletteList: blessed.Widgets.ListElement;
  composerOverlay: blessed.Widgets.BoxElement;
  composer: blessed.Widgets.TextareaElement;
  inputBox: blessed.Widgets.TextboxElement;
  footer: blessed.Widgets.BoxElement;
}

export interface TuiWidgetFactoryOptions {
  screen: blessed.Widgets.Screen;
  theme: TuiThemeProfile;
  agentName: string;
  ui?: typeof blessed;
}
