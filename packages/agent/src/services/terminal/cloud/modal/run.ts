import type { RuntimeSettings } from "../../../settings/runtime-settings";
import {
  normalizeBackendError,
  runCommand,
  sanitizeCommand,
  type TerminalRunResult,
} from "../../execution/subprocess";
import { recordCloudRunLifecycle } from "../lifecycle";
import { buildCloudProfile, buildModalShellArgs } from "../planning";
import { createMissingCloudTargetRunResult } from "../shared";
import type { CloudStateAccessor } from "../store";

export async function runModalCommand(
  cloudState: CloudStateAccessor,
  command: string,
  options: {
    cwd: string;
    timeoutMs: number;
    settings: RuntimeSettings;
    abortSignal?: AbortSignal;
  },
): Promise<TerminalRunResult> {
  const cloud = buildCloudProfile("modal", options.settings, options.cwd);
  const safeCommand = sanitizeCommand(command);
  if (!cloud.target) {
    return createMissingCloudTargetRunResult("Modal", "execution.modalTarget");
  }
  const result = normalizeBackendError(
    await runCommand(
      buildModalShellArgs(options.settings, safeCommand, options.cwd),
      {
        timeoutMs: options.timeoutMs,
        abortSignal: options.abortSignal,
      },
    ),
  );
  recordCloudRunLifecycle({
    cloudState,
    cloud,
    command: safeCommand,
    cwd: options.cwd,
    result,
    successSummary: `Modal command completed successfully for ${cloud.workspaceLabel}.`,
    failureSummary: `Modal command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
  });
  return result;
}
