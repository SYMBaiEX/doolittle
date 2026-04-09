import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { shellQuote } from "../../execution/subprocess";
import { isValidEnvName } from "../sync-plan";

export function buildCloudCommandScript(
  command: string,
  workspacePath: string,
  settings: RuntimeSettings,
  options: {
    bootstrapCommand?: string;
  },
): string {
  const execution = settings.execution;
  const envAssignments = execution.dockerEnvPassthrough
    .filter(isValidEnvName)
    .filter((name) => process.env[name] !== undefined)
    .map((name) => `${name}=${shellQuote(process.env[name] ?? "")}`);
  const parts = [
    "set -eu",
    `cd ${shellQuote(workspacePath)}`,
    envAssignments.length > 0 ? `export ${envAssignments.join(" ")}` : "",
    options.bootstrapCommand ? options.bootstrapCommand : "",
    command,
  ].filter(Boolean);
  return parts.join(" && ");
}
