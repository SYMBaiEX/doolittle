import { requireReadline } from "./readline";
import { chooseManyFallback, chooseOneFallback } from "./selection-fallback";
import {
  chooseManyInteractive,
  chooseOneInteractive,
} from "./selection-interactive";
import { supportsInteractiveMenus } from "./terminal-menu";
import type {
  PromptHandle,
  PromptRuntime,
  SelectManyOption,
  SelectOneOption,
} from "./types";

export async function chooseOne<T extends string>(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  optionsList: SelectOneOption<T>[],
  defaultValue: T,
  options?: { onHighlight?: (value: T) => void },
): Promise<T> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.selectOne(prompt, optionsList, defaultValue, options);
  }

  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return chooseOneInteractive(prompt, optionsList, defaultValue, options);
  }

  return chooseOneFallback(
    runtime,
    promptInterface.question.bind(promptInterface),
    prompt,
    optionsList,
    defaultValue,
  );
}

export async function chooseMany<T extends string>(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  optionsList: SelectManyOption<T>[],
  defaults: T[],
): Promise<T[]> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.selectMany(prompt, optionsList, defaults);
  }

  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return chooseManyInteractive(prompt, optionsList, defaults);
  }

  return chooseManyFallback(
    runtime,
    promptInterface.question.bind(promptInterface),
    prompt,
    optionsList,
    defaults,
  );
}
