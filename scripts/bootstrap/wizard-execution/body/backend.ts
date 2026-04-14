import type { BootstrapWizardContext } from "../../bootstrap-context";
import type { PromptHandle } from "../../prompting/types";
import type { ExecutionBackendName, WizardAnswers } from "../../types";
import type { ExecutionBodyPromptDeps } from "./types";

export async function promptExecutionBackend(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  mode: WizardAnswers["mode"],
  backend: ExecutionBackendName,
  promptDeps: Pick<ExecutionBodyPromptDeps, "chooseOne">,
): Promise<ExecutionBackendName> {
  if (mode === "ritual") {
    context.section("Body", "Choose where I should live and act.");
    return await promptDeps.chooseOne<ExecutionBackendName>(
      context,
      rl,
      "Where should I execute:",
      [
        {
          value: "local",
          label: "Local machine",
          detail: "Fastest embodiment for direct local development.",
        },
        {
          value: "docker",
          label: "Docker",
          detail: "A contained local body with cleaner boundaries.",
        },
        {
          value: "podman",
          label: "Podman",
          detail: "A rootless container body with strong isolation.",
        },
        {
          value: "ssh",
          label: "SSH",
          detail: "A remote body on a server, workstation, or homelab node.",
        },
        {
          value: "daytona",
          label: "Daytona",
          detail: "A cloud workspace body for remote development loops.",
        },
        {
          value: "modal",
          label: "Modal",
          detail: "An elastic cloud body for bursty execution.",
        },
        {
          value: "singularity",
          label: "Singularity",
          detail: "A scientific or HPC body with strict runtime shape.",
        },
      ],
      backend,
    );
  }

  context.section(
    "Body",
    "Quick ignition keeps the body simple so you reach the shell faster.",
  );
  context.info(
    `Using ${backend} as the default body for first boot. You can change this later from doolittle setup.`,
  );
  return backend;
}
