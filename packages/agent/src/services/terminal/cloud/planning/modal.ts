import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { buildRemoteSyncPlan, isValidEnvName } from "../sync-plan";
import type { CloudPlanningSummary } from "../types";
import { buildCloudCommandScript } from "./shared";

export function buildModalCloudPlanningSummary(
  settings: RuntimeSettings,
  workspacePath: string,
): CloudPlanningSummary {
  const execution = settings.execution;
  const remoteWorkspacePath = execution.modalWorkspacePath || workspacePath;
  const envPassthrough = execution.dockerEnvPassthrough.filter(isValidEnvName);
  const syncPlan = buildRemoteSyncPlan(
    "modal",
    settings,
    workspacePath,
    remoteWorkspacePath,
  );

  return {
    binary: execution.modalCommand || "modal",
    target: execution.modalTarget,
    shell: execution.modalShell || "/bin/bash",
    bootstrapCommand: execution.modalBootstrapCommand || undefined,
    statusCommand: execution.modalStatusCommand || undefined,
    inspectCommand:
      execution.modalInspectCommand ||
      `modal shell ${execution.modalTarget || "REF"}${
        execution.modalEnvironment ? ` -e ${execution.modalEnvironment}` : ""
      } --cmd ${execution.modalShell || "/bin/bash"} -lc "pwd"`,
    profile: {
      provider: "modal",
      target: execution.modalTarget,
      shell: execution.modalShell || "/bin/bash",
      workspacePath: remoteWorkspacePath,
      state: "interactive-shell",
      commandStyle: "shell",
      envPassthrough,
      workspaceLabel: syncPlan.workspaceLabel,
      syncPlan,
      artifactPolicy: execution.remoteArtifactPolicy,
      artifactPaths: syncPlan.artifactPaths,
      environment: execution.modalEnvironment || undefined,
      bootstrapCommand: execution.modalBootstrapCommand || undefined,
      statusCommand: execution.modalStatusCommand || undefined,
      inspectCommand:
        execution.modalInspectCommand ||
        `modal shell ${execution.modalTarget || "REF"}${
          execution.modalEnvironment ? ` -e ${execution.modalEnvironment}` : ""
        } --cmd ${execution.modalShell || "/bin/bash"} -lc "pwd"`,
    },
  };
}

export function buildModalShellArgs(
  settings: RuntimeSettings,
  command: string,
  cwd: string,
): string[] {
  const summary = buildModalCloudPlanningSummary(settings, cwd || "/workspace");
  const script = buildCloudCommandScript(
    command,
    summary.profile.workspacePath,
    settings,
    {
      bootstrapCommand: summary.bootstrapCommand,
    },
  );
  const args = [summary.binary, "shell", summary.target || "REF"];
  if (settings.execution.modalEnvironment) {
    args.push("-e", settings.execution.modalEnvironment);
  }
  args.push("--cmd", `${summary.shell} -lc ${script}`);
  return args;
}
