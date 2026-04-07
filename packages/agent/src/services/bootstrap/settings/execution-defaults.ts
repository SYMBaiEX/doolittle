import type { EnvConfig } from "@/types";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "./types";

function setStringWhenBlank(
  set: SettingsSetter,
  path: string,
  currentValue: string | undefined,
  nextValue: string | undefined,
): void {
  if (!currentValue && nextValue) {
    set(path, nextValue);
  }
}

function setNumberWhenMissing(
  set: SettingsSetter,
  path: string,
  currentValue: number | undefined,
  nextValue: number | undefined,
): void {
  if (!currentValue && nextValue) {
    set(path, nextValue);
  }
}

function setArrayWhenEmpty(
  set: SettingsSetter,
  path: string,
  currentValue: string[] | undefined,
  nextValue: string[],
): void {
  if (!currentValue?.length && nextValue.length) {
    set(path, nextValue);
  }
}

export function applyMissingExecutionDefaults(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  set: SettingsSetter,
): void {
  setStringWhenBlank(
    set,
    "execution.dockerNetwork",
    currentSettings.execution.dockerNetwork,
    config.dockerNetwork,
  );
  setStringWhenBlank(
    set,
    "execution.remoteSyncMode",
    currentSettings.execution.remoteSyncMode,
    config.remoteSyncMode,
  );
  setArrayWhenEmpty(
    set,
    "execution.remoteSyncInclude",
    currentSettings.execution.remoteSyncInclude,
    config.remoteSyncInclude,
  );
  setArrayWhenEmpty(
    set,
    "execution.remoteSyncExclude",
    currentSettings.execution.remoteSyncExclude,
    config.remoteSyncExclude,
  );
  setArrayWhenEmpty(
    set,
    "execution.remoteArtifactPaths",
    currentSettings.execution.remoteArtifactPaths,
    config.remoteArtifactPaths,
  );
  setStringWhenBlank(
    set,
    "execution.remoteArtifactPolicy",
    currentSettings.execution.remoteArtifactPolicy,
    config.remoteArtifactPolicy,
  );
  setStringWhenBlank(
    set,
    "execution.remoteWorkspaceLabel",
    currentSettings.execution.remoteWorkspaceLabel,
    config.remoteWorkspaceLabel,
  );
  setStringWhenBlank(
    set,
    "execution.dockerWorkspacePath",
    currentSettings.execution.dockerWorkspacePath,
    config.dockerWorkspacePath,
  );
  setArrayWhenEmpty(
    set,
    "execution.dockerEnvPassthrough",
    currentSettings.execution.dockerEnvPassthrough,
    config.dockerEnvPassthrough,
  );
  setStringWhenBlank(
    set,
    "execution.singularityImage",
    currentSettings.execution.singularityImage,
    config.singularityImage,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaTarget",
    currentSettings.execution.daytonaTarget,
    config.daytonaTarget,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaCommand",
    currentSettings.execution.daytonaCommand,
    config.daytonaCommand,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaShell",
    currentSettings.execution.daytonaShell,
    config.daytonaShell,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaWorkspacePath",
    currentSettings.execution.daytonaWorkspacePath,
    config.daytonaWorkspacePath,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaSnapshot",
    currentSettings.execution.daytonaSnapshot,
    config.daytonaSnapshot,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaBootstrapCommand",
    currentSettings.execution.daytonaBootstrapCommand,
    config.daytonaBootstrapCommand,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaStatusCommand",
    currentSettings.execution.daytonaStatusCommand,
    config.daytonaStatusCommand,
  );
  setStringWhenBlank(
    set,
    "execution.daytonaInspectCommand",
    currentSettings.execution.daytonaInspectCommand,
    config.daytonaInspectCommand,
  );
  setStringWhenBlank(
    set,
    "execution.modalTarget",
    currentSettings.execution.modalTarget,
    config.modalTarget,
  );
  setStringWhenBlank(
    set,
    "execution.modalCommand",
    currentSettings.execution.modalCommand,
    config.modalCommand,
  );
  setStringWhenBlank(
    set,
    "execution.modalShell",
    currentSettings.execution.modalShell,
    config.modalShell,
  );
  setStringWhenBlank(
    set,
    "execution.modalWorkspacePath",
    currentSettings.execution.modalWorkspacePath,
    config.modalWorkspacePath,
  );
  setStringWhenBlank(
    set,
    "execution.modalEnvironment",
    currentSettings.execution.modalEnvironment,
    config.modalEnvironment,
  );
  setStringWhenBlank(
    set,
    "execution.modalBootstrapCommand",
    currentSettings.execution.modalBootstrapCommand,
    config.modalBootstrapCommand,
  );
  setStringWhenBlank(
    set,
    "execution.modalStatusCommand",
    currentSettings.execution.modalStatusCommand,
    config.modalStatusCommand,
  );
  setStringWhenBlank(
    set,
    "execution.modalInspectCommand",
    currentSettings.execution.modalInspectCommand,
    config.modalInspectCommand,
  );
  setNumberWhenMissing(
    set,
    "execution.commandTimeoutMs",
    currentSettings.execution.commandTimeoutMs,
    config.executionCommandTimeoutMs,
  );
  setNumberWhenMissing(
    set,
    "execution.healthTimeoutMs",
    currentSettings.execution.healthTimeoutMs,
    config.executionHealthTimeoutMs,
  );
  setStringWhenBlank(
    set,
    "execution.containerCpuLimit",
    currentSettings.execution.containerCpuLimit,
    config.containerCpuLimit,
  );
  setStringWhenBlank(
    set,
    "execution.containerMemoryLimit",
    currentSettings.execution.containerMemoryLimit,
    config.containerMemoryLimit,
  );
  setNumberWhenMissing(
    set,
    "execution.containerPidsLimit",
    currentSettings.execution.containerPidsLimit,
    config.containerPidsLimit,
  );
  if (currentSettings.execution.containerReadOnlyRoot === undefined) {
    set("execution.containerReadOnlyRoot", config.containerReadOnlyRoot);
  }
  setNumberWhenMissing(
    set,
    "execution.sshPort",
    currentSettings.execution.sshPort,
    config.sshPort,
  );
  setStringWhenBlank(
    set,
    "execution.sshKeyPath",
    currentSettings.execution.sshKeyPath,
    config.sshKeyPath,
  );
  if (
    !currentSettings.execution.sshStrictHostKeyChecking &&
    config.sshStrictHostKeyChecking
  ) {
    set("execution.sshStrictHostKeyChecking", config.sshStrictHostKeyChecking);
  }
  setStringWhenBlank(
    set,
    "mcp.serverCommand",
    currentSettings.mcp.serverCommand,
    config.mcpServerCommand,
  );
  setNumberWhenMissing(
    set,
    "mcp.timeoutMs",
    currentSettings.mcp.timeoutMs,
    config.mcpTimeoutMs,
  );
}
