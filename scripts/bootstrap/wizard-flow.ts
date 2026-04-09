import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { getLinkedProviderAccountsSnapshot } from "../../packages/agent/src/runtime/native/account-auth/index";
import { createHeadlessAnswers } from "./answers";
import type { BootstrapWizardContext } from "./bootstrap-context";
import type { PromptHandle } from "./core/prompts";
import { runProviderSelectionFlow } from "./provider/selection";
import type { WizardAnswers } from "./types";
import {
  getDependencyProbes,
  printDependencyProbes,
} from "./wizard/dependencies";
import { runWizardIdentitySelection } from "./wizard/identity";
import { runReviewAndConfirmFlow } from "./wizard/review";
import { createInteractiveWizardAnswers } from "./wizard/state";
import { runExecutionSelectionFlow } from "./wizard-execution-flow";
import { createWizardScreen } from "./wizard-screen/surface";

export async function runWizard(
  existingEnv: Map<string, string>,
  context: BootstrapWizardContext,
): Promise<WizardAnswers> {
  if (context.options.headless || context.options.skipWizard) {
    return createHeadlessAnswers(existingEnv);
  }

  if (input.isTTY && output.isTTY) {
    const cols = typeof output.columns === "number" ? output.columns : 0;
    const rows = typeof output.rows === "number" ? output.rows : 0;
    if (cols >= 96 && rows >= 28) {
      context.setWizardScreen(
        createWizardScreen({
          formatKeyLabel: context.formatKeyLabel,
          onAbort: () => process.exit(1),
        }),
      );
    } else {
      context.banner();
      context.warn(
        `Terminal is ${cols || "unknown"}x${rows || "unknown"}. I’m switching to the line wizard so the setup stays readable.`,
      );
      context.info(
        "If you want the fullscreen ritual later, expand the terminal and rerun `doolittle setup`.",
      );
    }
  }

  context.banner();
  const dependencyProbes = getDependencyProbes(context.root, existingEnv);
  let linkedAccounts = getLinkedProviderAccountsSnapshot();
  printDependencyProbes(context, dependencyProbes);
  const rl: PromptHandle = context.getWizardScreen()
    ? null
    : createInterface({ input, output });

  try {
    while (true) {
      const identity = await runWizardIdentitySelection(
        context,
        rl,
        existingEnv,
      );

      const answers = createInteractiveWizardAnswers(
        existingEnv,
        linkedAccounts,
      );
      answers.mode = identity.mode;
      answers.agentName = identity.agentName;
      answers.timezone = identity.timezone;
      answers.theme = identity.theme;

      linkedAccounts = await runProviderSelectionFlow(
        context,
        rl,
        existingEnv,
        answers,
        linkedAccounts,
      );
      await runExecutionSelectionFlow(
        context,
        rl,
        existingEnv,
        dependencyProbes,
        answers,
      );

      const reviewedAnswers = await runReviewAndConfirmFlow(
        context,
        rl,
        answers,
        linkedAccounts,
      );
      if (!reviewedAnswers) {
        continue;
      }

      return reviewedAnswers;
    }
  } finally {
    rl?.close();
    context.getWizardScreen()?.destroy();
    context.setWizardScreen(null);
  }
}
