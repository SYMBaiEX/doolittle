import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { bootstrapColor, paint } from "../core/output";
import { requireReadline } from "./readline";
import { ask } from "./text-prompts";
import type { PromptHandle, PromptRuntime } from "./types";

export async function askSecret(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.promptText(prompt, defaultValue, { secret: true });
  }
  if (!input.isTTY || !output.isTTY) {
    return ask(runtime, rl, prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);

  const suffix = defaultValue ? " [stored]" : "";
  const previousState = spawnSync("stty", ["-g"], {
    stdio: ["inherit", "pipe", "inherit"],
  })
    .stdout.toString()
    .trim();

  spawnSync("stty", ["-echo"], { stdio: "inherit" });
  try {
    const answer = (
      await promptInterface.question(
        paint(`${prompt}${suffix}: `, bootstrapColor.amber),
      )
    ).trim();
    output.write("\n");
    return answer || defaultValue;
  } finally {
    if (previousState) {
      spawnSync("stty", [previousState], { stdio: "inherit" });
    } else {
      spawnSync("stty", ["echo"], { stdio: "inherit" });
    }
  }
}
