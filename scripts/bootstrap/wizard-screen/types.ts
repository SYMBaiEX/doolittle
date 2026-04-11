import type { TuiThemeName } from "../../../packages/agent/src/runtime/theme-catalog";

export type WizardSnapshot = {
  title: string;
  subtitle: string;
  currentSection: string;
  currentDetail: string;
  logLines: string[];
};

export type WizardScreenContext = {
  setSection: (title: string, detail?: string) => void;
  appendLine: (message: string) => void;
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
  previewTheme: (theme: TuiThemeName) => void;
  snapshot: () => WizardSnapshot;
  destroy: () => void;
};

export interface CreateWizardScreenOptions {
  initial?: Partial<WizardSnapshot>;
  formatKeyLabel: (label: string) => string;
  onAbort?: () => void;
}
