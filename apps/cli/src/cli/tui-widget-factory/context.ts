import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";
import blessed from "blessed";
import type { TuiWidgetFactoryOptions } from "./types";

export type BlessedUi = NonNullable<TuiWidgetFactoryOptions["ui"]>;
export type Screen = TuiWidgetFactoryOptions["screen"];

export interface TuiWidgetFactoryContext {
  ui: BlessedUi;
  screen: Screen;
  theme: TuiThemeProfile;
}

export interface TuiWidgetAssemblyContext extends TuiWidgetFactoryContext {
  agentName: string;
}

export function resolveTuiWidgetAssemblyContext(
  options: TuiWidgetFactoryOptions,
): TuiWidgetAssemblyContext {
  const { screen, theme, agentName, ui = blessed } = options;
  return { ui, screen, theme, agentName };
}
