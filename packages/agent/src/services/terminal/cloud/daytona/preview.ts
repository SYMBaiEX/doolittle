import type { ExecutionBackendPreview } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { buildBootstrapHints, renderChecks } from "../../execution/diagnostics";
import { sanitizeCommand } from "../../execution/subprocess";
import { buildCloudPreviewLifecycle } from "../lifecycle";
import {
  buildCloudProfile,
  buildCloudRuntimePreviewChecks,
  buildDaytonaExecArgs,
} from "../planning";

interface BuildDaytonaPreviewInput {
  cloudState: Parameters<typeof buildCloudPreviewLifecycle>[0]["cloudState"];
  command: string;
  settings: RuntimeSettings;
  cwd: string;
  timeoutMs: number;
}

export function buildDaytonaPreview({
  cloudState,
  command,
  settings,
  cwd,
  timeoutMs,
}: BuildDaytonaPreviewInput): ExecutionBackendPreview {
  const safeCommand = sanitizeCommand(command);
  const cloud = buildCloudProfile("daytona", settings, cwd);
  const checks = buildCloudRuntimePreviewChecks("daytona", settings, cwd);
  const argv = buildDaytonaExecArgs(settings, safeCommand, cwd, timeoutMs);
  return buildCloudPreviewLifecycle({
    backend: "daytona",
    cloudState,
    cloud,
    command: safeCommand,
    cwd,
    timeoutMs,
    argv,
    ready: Boolean(cloud.target && cloud.workspacePath),
    detail: `Daytona execution uses a persistent sandbox target (${cloud.target || "TARGET"}) with snapshot-aware workspace execution.`,
    summary: `Daytona preview planned for ${cloud.target || "TARGET"} using ${cloud.workspaceLabel}.`,
    diagnostics: renderChecks(checks),
    checks,
    bootstrap: buildBootstrapHints(checks, [
      `Install the ${settings.execution.daytonaCommand || "daytona"} CLI and authenticate it locally.`,
      `Confirm access to the sandbox target ${cloud.target || "TARGET"}.`,
    ]),
  });
}
