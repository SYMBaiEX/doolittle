import type blessed from "blessed";
import type { WizardScreenWidgets } from "../widgets";

export interface WizardPromptOverlayDependencies {
  formatKeyLabel: (label: string) => string;
  render: () => void;
  setFooter: (content: string) => void;
  showOverlay: <T>(
    title: string,
    body: string,
    mount: (
      overlay: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ) => Promise<T>;
  widgets: WizardScreenWidgets;
}

export interface WizardPromptHandlers {
  promptText: (
    prompt: string,
    defaultValue?: string,
    options?: { secret?: boolean },
  ) => Promise<string>;
  promptYesNo: (prompt: string, defaultValue: boolean) => Promise<boolean>;
  selectOne: <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string; detail?: string }>,
    defaultValue: T,
    options?: { onHighlight?: (value: T) => void },
  ) => Promise<T>;
  selectMany: <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string }>,
    defaults: T[],
  ) => Promise<T[]>;
}
