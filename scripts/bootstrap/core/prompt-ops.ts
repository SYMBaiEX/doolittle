import type { BootstrapWizardContext } from "../bootstrap-context";
import { askSecret as promptAskSecret } from "../prompting/secret";
import {
  chooseMany as promptChooseMany,
  chooseOne as promptChooseOne,
} from "../prompting/selection";
import {
  ask as promptAsk,
  askYesNo as promptAskYesNo,
} from "../prompting/text-prompts";
import type { PromptHandle, PromptRuntime } from "../prompting/types";

export function createPromptRuntime(
  context: BootstrapWizardContext,
): PromptRuntime {
  return {
    getWizardScreen: context.getWizardScreen,
    warn: context.warn,
    info: context.info,
  };
}

export async function ask(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  return promptAsk(createPromptRuntime(context), rl, prompt, defaultValue);
}

export async function chooseOne<T extends string>(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  prompt: string,
  optionsList: Array<{ value: T; label: string; detail?: string }>,
  defaultValue: T,
  options?: { onHighlight?: (value: T) => void },
): Promise<T> {
  return promptChooseOne(
    createPromptRuntime(context),
    rl,
    prompt,
    optionsList,
    defaultValue,
    options,
  );
}

export async function chooseMany<T extends string>(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  prompt: string,
  optionsList: Array<{ value: T; label: string }>,
  defaults: T[],
): Promise<T[]> {
  return promptChooseMany(
    createPromptRuntime(context),
    rl,
    prompt,
    optionsList,
    defaults,
  );
}

export async function askSecret(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  return promptAskSecret(
    createPromptRuntime(context),
    rl,
    prompt,
    defaultValue,
  );
}

export async function askYesNo(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  prompt: string,
  defaultValue: boolean,
): Promise<boolean> {
  return promptAskYesNo(createPromptRuntime(context), rl, prompt, defaultValue);
}
