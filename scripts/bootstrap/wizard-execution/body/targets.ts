import type { BootstrapWizardContext } from "../../bootstrap-context";
import type { PromptHandle } from "../../prompting/types";
import type { ExecutionBackendName, WizardAnswers } from "../../types";
import type {
  ExecutionBodyPromptDeps,
  ExecutionBodyTargetSelectionResult,
} from "./types";

export async function promptExecutionTargets(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  backend: ExecutionBackendName,
  answers: WizardAnswers,
  promptDeps: Pick<ExecutionBodyPromptDeps, "ask">,
): Promise<ExecutionBodyTargetSelectionResult> {
  let sshHost = answers.sshHost;
  let sshUser = answers.sshUser;
  let sshPath = answers.sshPath;
  let daytonaTarget = answers.daytonaTarget;
  let modalTarget = answers.modalTarget;

  if (backend === "ssh") {
    sshHost = await promptDeps.ask(
      context,
      rl,
      "What host should I inhabit over SSH",
      sshHost,
    );
    sshUser = await promptDeps.ask(
      context,
      rl,
      "Which SSH user should I become",
      sshUser,
    );
    sshPath = await promptDeps.ask(
      context,
      rl,
      "What workspace path should I wake up inside",
      sshPath || "~/workspace/doolittle",
    );
  } else if (backend === "daytona") {
    daytonaTarget = await promptDeps.ask(
      context,
      rl,
      "Which Daytona target should hold me",
      daytonaTarget,
    );
  } else if (backend === "modal") {
    modalTarget = await promptDeps.ask(
      context,
      rl,
      "Which Modal target should hold me",
      modalTarget,
    );
  }

  return {
    sshHost,
    sshUser,
    sshPath,
    daytonaTarget,
    modalTarget,
  };
}
