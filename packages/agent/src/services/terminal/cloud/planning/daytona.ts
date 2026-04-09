import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { buildRemoteSyncPlan, isValidEnvName } from "../sync-plan";
import type { CloudPlanningSummary } from "../types";
import { buildCloudCommandScript } from "./shared";

export function buildDaytonaCloudPlanningSummary(
  settings: RuntimeSettings,
  workspacePath: string,
): CloudPlanningSummary {
  const execution = settings.execution;
  const remoteWorkspacePath = execution.daytonaWorkspacePath || workspacePath;
  const envPassthrough = execution.dockerEnvPassthrough.filter(isValidEnvName);
  const syncPlan = buildRemoteSyncPlan(
    "daytona",
    settings,
    workspacePath,
    remoteWorkspacePath,
  );

  return {
    binary: execution.daytonaCommand || "daytona",
    target: execution.daytonaTarget,
    shell: execution.daytonaShell || "/bin/sh",
    bootstrapCommand: execution.daytonaBootstrapCommand || undefined,
    statusCommand: execution.daytonaStatusCommand || undefined,
    inspectCommand:
      execution.daytonaInspectCommand ||
      `daytona info ${execution.daytonaTarget || "TARGET"} --format json`,
    profile: {
      provider: "daytona",
      target: execution.daytonaTarget,
      shell: execution.daytonaShell || "/bin/sh",
      workspacePath: remoteWorkspacePath,
      state: "persistent-sandbox",
      commandStyle: "exec",
      envPassthrough,
      workspaceLabel: syncPlan.workspaceLabel,
      syncPlan,
      artifactPolicy: execution.remoteArtifactPolicy,
      artifactPaths: syncPlan.artifactPaths,
      snapshot: execution.daytonaSnapshot || undefined,
      bootstrapCommand: execution.daytonaBootstrapCommand || undefined,
      statusCommand: execution.daytonaStatusCommand || undefined,
      inspectCommand:
        execution.daytonaInspectCommand ||
        `daytona info ${execution.daytonaTarget || "TARGET"} --format json`,
    },
  };
}

export function buildDaytonaExecArgs(
  settings: RuntimeSettings,
  command: string,
  cwd: string,
  timeoutMs: number,
): string[] {
  const summary = buildDaytonaCloudPlanningSummary(
    settings,
    cwd || "/workspace",
  );
  const script = buildCloudCommandScript(
    command,
    summary.profile.workspacePath,
    settings,
    {
      bootstrapCommand: summary.bootstrapCommand,
    },
  );
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return [
    summary.binary,
    "exec",
    summary.target || "TARGET",
    "--cwd",
    summary.profile.workspacePath,
    "--timeout",
    String(timeoutSeconds),
    "--",
    summary.shell,
    "-lc",
    script,
  ];
}

export function buildDaytonaInfoArgs(settings: RuntimeSettings): string[] {
  const summary = buildDaytonaCloudPlanningSummary(settings, "");
  return [
    summary.binary,
    "info",
    summary.target || "TARGET",
    "--format",
    "json",
  ];
}
