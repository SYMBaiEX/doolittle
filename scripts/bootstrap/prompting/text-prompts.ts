import { bootstrapColor, paint } from "../core/output";
import { requireReadline } from "./readline";
import type { PromptHandle, PromptRuntime } from "./types";

export async function ask(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.promptText(prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (
    await promptInterface.question(
      paint(`${prompt}${suffix}: `, bootstrapColor.amber),
    )
  ).trim();
  return answer || defaultValue;
}

export async function askYesNo(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  defaultValue: boolean,
): Promise<boolean> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.promptYesNo(prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);
  const fallback = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (
      await promptInterface.question(
        paint(`${prompt} [${fallback}]: `, bootstrapColor.amber),
      )
    )
      .trim()
      .toLowerCase();
    if (!answer) {
      return defaultValue;
    }
    if (answer === "y" || answer === "yes") {
      return true;
    }
    if (answer === "n" || answer === "no") {
      return false;
    }
    runtime.warn("Please answer yes or no.");
  }
}
