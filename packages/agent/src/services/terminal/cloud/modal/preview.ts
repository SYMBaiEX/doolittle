import type { ExecutionBackendPreview } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { buildBootstrapHints, renderChecks } from "../../execution/diagnostics";
import { sanitizeCommand } from "../../execution/subprocess";
import { buildCloudPreviewLifecycle } from "../lifecycle";
import {
  buildCloudProfile,
  buildCloudRuntimePreviewChecks,
  buildModalShellArgs,
} from "../planning";
import type { CloudStateAccessor } from "../store";

export function buildModalPreview(
  cloudState: CloudStateAccessor,
  command: string,
  options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
): ExecutionBackendPreview {
  const cloud = buildCloudProfile("modal", options.settings, options.cwd);
  const safeCommand = sanitizeCommand(command);
  const checks = buildCloudRuntimePreviewChecks(
    "modal",
    options.settings,
    options.cwd,
  );
  return buildCloudPreviewLifecycle({
    backend: "modal",
    cloudState,
    cloud,
    command: safeCommand,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    argv: buildModalShellArgs(options.settings, safeCommand, options.cwd),
    ready: Boolean(cloud.target && cloud.workspacePath),
    detail: `Modal execution uses a shell session against target ${cloud.target || "REF"} with explicit environment selection${cloud.environment ? ` (${cloud.environment})` : ""}.`,
    summary: `Modal preview planned for ${cloud.target || "REF"} using ${cloud.workspaceLabel}.`,
    diagnostics: renderChecks(checks),
    checks,
    bootstrap: buildBootstrapHints(checks, [
      `Install the ${options.settings.execution.modalCommand || "modal"} CLI and authenticate it locally.`,
      cloud.environment
        ? `Confirm Modal environment ${cloud.environment} is available for shell sessions.`
        : "Set a Modal environment if your workspace has multiple environments.",
    ]),
  });
}
