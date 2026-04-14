import type { BootstrapWizardContext } from "../../bootstrap-context";
import type { PromptHandle } from "../../prompting/types";
import type { BrowserMode, WizardAnswers } from "../../types";
import type { ExecutionBodyPromptDeps } from "./types";

export async function promptExecutionBrowser(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  mode: WizardAnswers["mode"],
  browser: BrowserMode,
  promptDeps: Pick<ExecutionBodyPromptDeps, "chooseOne">,
): Promise<BrowserMode> {
  if (mode === "ritual") {
    return await promptDeps.chooseOne<BrowserMode>(
      context,
      rl,
      "Choose my eyes:",
      [
        {
          value: "lightpanda",
          label: "Lightpanda",
          detail: "Full browser vision and the best default for web work.",
        },
        {
          value: "basic",
          label: "Basic HTTP",
          detail:
            "Lighter, simpler sight if browser automation is not installed yet.",
        },
      ],
      browser,
    );
  }

  context.info(
    `Using ${browser === "lightpanda" ? "Lightpanda" : "Basic HTTP"} vision for first boot.`,
  );
  return browser;
}
