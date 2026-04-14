import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { TerminalRunResult } from "../../execution/subprocess";
import {
  normalizeBackendError,
  runCommand,
  sanitizeCommand,
} from "../../execution/subprocess";
import { recordCloudRunLifecycle } from "../lifecycle";
import { buildCloudProfile, buildDaytonaExecArgs } from "../planning";
import { createMissingCloudTargetRunResult } from "../shared";
import type { CloudStateAccessor } from "../store";

interface BuildDaytonaRunInput {
  cloudState: CloudStateAccessor;
  settings: RuntimeSettings;
  command: string;
  cwd: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}

export async function runDaytonaCommand({
  cloudState,
  settings,
  command,
  cwd,
  timeoutMs,
  abortSignal,
}: BuildDaytonaRunInput): Promise<TerminalRunResult> {
  const cloud = buildCloudProfile("daytona", settings, cwd);
  const safeCommand = sanitizeCommand(command);
  if (!cloud.target) {
    return createMissingCloudTargetRunResult(
      "Daytona",
      "execution.daytonaTarget",
    );
  }
  const result = normalizeBackendError(
    await runCommand(
      buildDaytonaExecArgs(settings, safeCommand, cwd, timeoutMs),
      {
        timeoutMs,
        abortSignal,
      },
    ),
  );
  recordCloudRunLifecycle({
    cloudState,
    cloud,
    command: safeCommand,
    cwd,
    result,
    successSummary: `Daytona command completed successfully for ${cloud.workspaceLabel}.`,
    failureSummary: `Daytona command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
  });
  return result;
}
