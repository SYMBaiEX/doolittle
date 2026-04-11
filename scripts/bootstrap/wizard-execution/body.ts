import type { BootstrapWizardContext } from "../bootstrap-context";
import { ask, askYesNo, chooseOne } from "../core/prompt-ops";
import type { PromptHandle } from "../core/prompts";
import {
  resolveBackendProbeKey,
  resolvePreferredBrowserDefault,
} from "../execution-flow/helpers";
import type {
  BootstrapDependencyProbe,
  BrowserMode,
  ExecutionBackendName,
  WizardAnswers,
} from "../types";

export interface ExecutionBodySelectionResult {
  backend: ExecutionBackendName;
  browser: BrowserMode;
  sshHost: string;
  sshUser: string;
  sshPath: string;
  daytonaTarget: string;
  modalTarget: string;
}

export function resolveExecutionBodyDefaults(
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
): Pick<ExecutionBodySelectionResult, "backend" | "browser"> {
  return {
    backend:
      (existingEnv.get(
        "DOOLITTLE_EXECUTION_BACKEND",
      ) as ExecutionBackendName) || "local",
    browser: resolvePreferredBrowserDefault(existingEnv, dependencyProbes),
  };
}

async function promptExecutionBackend(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  mode: WizardAnswers["mode"],
  backend: ExecutionBackendName,
): Promise<ExecutionBackendName> {
  if (mode === "ritual") {
    context.section("Body", "Choose where I should live and act.");
    return await chooseOne<ExecutionBackendName>(
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

async function promptExecutionBrowser(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  mode: WizardAnswers["mode"],
  browser: BrowserMode,
): Promise<BrowserMode> {
  if (mode === "ritual") {
    return await chooseOne<BrowserMode>(
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

async function promptExecutionTargets(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  backend: ExecutionBackendName,
  answers: WizardAnswers,
): Promise<
  Pick<
    ExecutionBodySelectionResult,
    "sshHost" | "sshUser" | "sshPath" | "daytonaTarget" | "modalTarget"
  >
> {
  let sshHost = answers.sshHost;
  let sshUser = answers.sshUser;
  let sshPath = answers.sshPath;
  let daytonaTarget = answers.daytonaTarget;
  let modalTarget = answers.modalTarget;

  if (backend === "ssh") {
    sshHost = await ask(
      context,
      rl,
      "What host should I inhabit over SSH",
      sshHost,
    );
    sshUser = await ask(context, rl, "Which SSH user should I become", sshUser);
    sshPath = await ask(
      context,
      rl,
      "What workspace path should I wake up inside",
      sshPath || "~/workspace/doolittle",
    );
  } else if (backend === "daytona") {
    daytonaTarget = await ask(
      context,
      rl,
      "Which Daytona target should hold me",
      daytonaTarget,
    );
  } else if (backend === "modal") {
    modalTarget = await ask(
      context,
      rl,
      "Which Modal target should hold me",
      modalTarget,
    );
  }

  return { sshHost, sshUser, sshPath, daytonaTarget, modalTarget };
}

export async function runExecutionBodySelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
  answers: WizardAnswers,
): Promise<ExecutionBodySelectionResult> {
  const defaults = resolveExecutionBodyDefaults(existingEnv, dependencyProbes);

  const backend = await promptExecutionBackend(
    context,
    rl,
    answers.mode,
    defaults.backend,
  );
  const backendProbeKey = resolveBackendProbeKey(backend);
  if (backendProbeKey) {
    const probe = dependencyProbes.find(
      (entry) => entry.key === backendProbeKey,
    );
    if (probe && !probe.installed) {
      context.warn(`${probe.label} is not installed yet.`);
    }
  }

  let browser = await promptExecutionBrowser(
    context,
    rl,
    answers.mode,
    defaults.browser,
  );
  if (browser === "lightpanda") {
    const probe = dependencyProbes.find((entry) => entry.key === "lightpanda");
    if (probe && !probe.installed) {
      context.warn(
        "Lightpanda is not installed yet. Basic HTTP is safer until you add it.",
      );
      if (
        answers.mode === "quick" ||
        (await askYesNo(
          context,
          rl,
          "Should I fall back to Basic HTTP for now",
          true,
        ))
      ) {
        browser = "basic";
      }
    }
  }

  const targets = await promptExecutionTargets(context, rl, backend, answers);

  return {
    backend,
    browser,
    ...targets,
  };
}
