import type { BootstrapWizardContext } from "../../bootstrap-context";
import { resolveBackendProbeKey } from "../../execution-flow/helpers";
import type { PromptHandle } from "../../prompting/types";
import type {
  BootstrapDependencyProbe,
  BrowserMode,
  ExecutionBackendName,
  WizardAnswers,
} from "../../types";
import type { ExecutionBodyPromptDeps } from "./types";

export function warnMissingExecutionBackendDependency(
  context: BootstrapWizardContext,
  dependencyProbes: BootstrapDependencyProbe[],
  backend: ExecutionBackendName,
): void {
  const backendProbeKey = resolveBackendProbeKey(backend);
  if (!backendProbeKey) {
    return;
  }

  const probe = dependencyProbes.find((entry) => entry.key === backendProbeKey);
  if (probe && !probe.installed) {
    context.warn(`${probe.label} is not installed yet.`);
  }
}

export async function resolveValidatedExecutionBrowser(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  mode: WizardAnswers["mode"],
  browser: BrowserMode,
  dependencyProbes: BootstrapDependencyProbe[],
  promptDeps: Pick<ExecutionBodyPromptDeps, "askYesNo">,
): Promise<BrowserMode> {
  if (browser !== "lightpanda") {
    return browser;
  }

  const probe = dependencyProbes.find((entry) => entry.key === "lightpanda");
  if (!probe || probe.installed) {
    return browser;
  }

  context.warn(
    "Lightpanda is not installed yet. Basic HTTP is safer until you add it.",
  );

  if (
    mode === "quick" ||
    (await promptDeps.askYesNo(
      context,
      rl,
      "Should I fall back to Basic HTTP for now",
      true,
    ))
  ) {
    return "basic";
  }

  return browser;
}
