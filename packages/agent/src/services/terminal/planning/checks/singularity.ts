import type { DiagnosticCheck } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { createCheck } from "../../execution/diagnostics";
import { buildShellCheck, buildWorkspaceCheck } from "./shared";

export function buildSingularityChecks(
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  imageAvailable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;

  return [
    createCheck(
      "singularity.runtime.binary",
      runtimeAvailable ? "pass" : "fail",
      "Singularity availability",
      runtimeAvailable
        ? "singularity command is available on this host."
        : "singularity command is not available on this host.",
    ),
    createCheck(
      "singularity.config.image",
      execution.singularityImage ? (imageAvailable ? "pass" : "warn") : "fail",
      "Singularity image",
      execution.singularityImage
        ? imageAvailable
          ? `Image configured: ${execution.singularityImage}.`
          : `Configured image was not found locally: ${execution.singularityImage}.`
        : "execution.singularityImage is not configured.",
    ),
    buildWorkspaceCheck(
      "singularity.workspace.mount",
      "Workspace bind mount",
      workspaceDir,
      `${workspaceDir} will bind to ${execution.dockerWorkspacePath}.`,
    ),
    buildShellCheck(
      "singularity.runtime.shell",
      "Container shell",
      "Commands execute through /bin/sh -lc inside the Singularity image.",
    ),
  ];
}
