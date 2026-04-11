import type { createInterface } from "node:readline/promises";

export interface BootstrapPromptScreen {
  promptText(
    prompt: string,
    defaultValue: string,
    options?: { secret?: boolean },
  ): Promise<string>;
  promptYesNo(prompt: string, defaultValue: boolean): Promise<boolean>;
  selectOne<T extends string>(
    prompt: string,
    optionsList: SelectOneOption<T>[],
    defaultValue: T,
    options?: { onHighlight?: (value: T) => void },
  ): Promise<T>;
  selectMany<T extends string>(
    prompt: string,
    optionsList: SelectManyOption<T>[],
    defaults: T[],
  ): Promise<T[]>;
}

export interface PromptRuntime {
  getWizardScreen(): BootstrapPromptScreen | null;
  warn(message: string): void;
  info(message: string): void;
}

export interface SelectOneOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

export interface SelectManyOption<T extends string> {
  value: T;
  label: string;
}

export type PromptHandle = ReturnType<typeof createInterface> | null;
