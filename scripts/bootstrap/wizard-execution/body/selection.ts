import type { BootstrapWizardContext } from "../../bootstrap-context";
import { ask, askYesNo, chooseOne } from "../../core/prompt-ops";
import type { PromptHandle } from "../../prompting/types";
import type { BootstrapDependencyProbe, WizardAnswers } from "../../types";
import { assembleExecutionBodySelection } from "./assembly";
import { promptExecutionBackend } from "./backend";
import { promptExecutionBrowser } from "./browser";
import { resolveExecutionBodyDefaults } from "./defaults";
import { promptExecutionTargets } from "./targets";
import type {
  ExecutionBodyPromptDeps,
  ExecutionBodySelectionResult,
} from "./types";
import {
  resolveValidatedExecutionBrowser,
  warnMissingExecutionBackendDependency,
} from "./validation";

const defaultExecutionBodyPromptDeps: ExecutionBodyPromptDeps = {
  chooseOne,
  ask,
  askYesNo,
};

export async function runExecutionBodySelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
  answers: WizardAnswers,
  promptDeps: ExecutionBodyPromptDeps = defaultExecutionBodyPromptDeps,
): Promise<ExecutionBodySelectionResult> {
  const defaults = resolveExecutionBodyDefaults(existingEnv, dependencyProbes);

  const backend = await promptExecutionBackend(
    context,
    rl,
    answers.mode,
    defaults.backend,
    promptDeps,
  );
  warnMissingExecutionBackendDependency(context, dependencyProbes, backend);

  const selectedBrowser = await promptExecutionBrowser(
    context,
    rl,
    answers.mode,
    defaults.browser,
    promptDeps,
  );
  const browser = await resolveValidatedExecutionBrowser(
    context,
    rl,
    answers.mode,
    selectedBrowser,
    dependencyProbes,
    promptDeps,
  );

  const targets = await promptExecutionTargets(
    context,
    rl,
    backend,
    answers,
    promptDeps,
  );

  return assembleExecutionBodySelection(backend, browser, targets);
}
