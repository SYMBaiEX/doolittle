import type { BootstrapWizardContext } from "../bootstrap-context";
import {
  ask,
  askSecret,
  askYesNo,
  chooseMany,
  chooseOne,
} from "../core/prompt-ops";
import type { PromptHandle } from "../core/prompts";
import type { WizardAnswers } from "../types";
import { runExecutionChannelSelectionFlow } from "./channels";
import { runExecutionToolSelectionFlow } from "./tooling";
import type {
  ExecutionHandsPromptDeps,
  ExecutionHandsSelectionResult,
} from "./types";

const defaultExecutionHandsPromptDeps: ExecutionHandsPromptDeps = {
  chooseMany,
  chooseOne,
  ask,
  askSecret,
  askYesNo,
};

export async function runExecutionHandsSelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  answers: WizardAnswers,
  promptDeps: ExecutionHandsPromptDeps = defaultExecutionHandsPromptDeps,
): Promise<ExecutionHandsSelectionResult> {
  const channels = await runExecutionChannelSelectionFlow(
    context,
    rl,
    answers,
    promptDeps,
  );
  const tools = await runExecutionToolSelectionFlow(
    context,
    rl,
    existingEnv,
    answers,
    promptDeps,
  );

  return {
    ...channels,
    ...tools,
  };
}
