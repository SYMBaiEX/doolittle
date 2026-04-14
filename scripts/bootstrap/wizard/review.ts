import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { finalizeWizardAnswers, summarizeAnswers } from "../answers";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { askYesNo } from "../core/prompt-ops";
import type { PromptHandle } from "../prompting/types";
import type { WizardAnswers } from "../types";

export interface ReviewFlowDeps {
  finalizeWizardAnswers: typeof finalizeWizardAnswers;
  summarizeAnswers: typeof summarizeAnswers;
  askYesNo: typeof askYesNo;
}

const defaultReviewFlowDeps: ReviewFlowDeps = {
  finalizeWizardAnswers,
  summarizeAnswers,
  askYesNo,
};

export async function runReviewAndConfirmFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  answers: WizardAnswers,
  linkedAccounts: LinkedProviderAccountsSnapshot,
  deps: ReviewFlowDeps = defaultReviewFlowDeps,
): Promise<WizardAnswers | null> {
  const reviewed = deps.finalizeWizardAnswers(answers, linkedAccounts);

  context.section(
    "Review",
    "I checked the final shape before writing it to disk.",
  );
  deps.summarizeAnswers(reviewed.answers).forEach((line) => {
    context.info(line);
  });
  if (reviewed.notices.length) {
    reviewed.notices.forEach((notice) => {
      context.warn(notice);
    });
  } else {
    context.info("No blocking issues detected in the final setup state.");
  }

  const confirm = await deps.askYesNo(
    context,
    rl,
    "Should I seal this configuration and wake up with it",
    true,
  );
  if (!confirm) {
    context
      .getWizardScreen()
      ?.appendLine(
        "Restarting the awakening so you can revise the configuration.",
      );
    return null;
  }

  return reviewed.answers;
}
