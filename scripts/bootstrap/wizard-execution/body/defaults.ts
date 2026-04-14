import { resolvePreferredBrowserDefault } from "../../execution-flow/helpers";
import type {
  BootstrapDependencyProbe,
  ExecutionBackendName,
} from "../../types";
import type { ExecutionBodyDefaults } from "./types";

export function resolveExecutionBodyDefaults(
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
): ExecutionBodyDefaults {
  return {
    backend:
      (existingEnv.get(
        "DOOLITTLE_EXECUTION_BACKEND",
      ) as ExecutionBackendName) || "local",
    browser: resolvePreferredBrowserDefault(existingEnv, dependencyProbes),
  };
}
