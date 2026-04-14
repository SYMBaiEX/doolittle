import type { EnvConfig } from "@/types";
import type { RuntimeSettingsSnapshot } from "../types";

export interface StringDefaultDefinition {
  path: string;
  current: (settings: RuntimeSettingsSnapshot) => string | undefined;
  next: (config: EnvConfig) => string | undefined;
}

export interface NumberDefaultDefinition {
  path: string;
  current: (settings: RuntimeSettingsSnapshot) => number | undefined;
  next: (config: EnvConfig) => number | undefined;
}

export interface ArrayDefaultDefinition {
  path: string;
  current: (settings: RuntimeSettingsSnapshot) => string[] | undefined;
  next: (config: EnvConfig) => string[];
}

export const STRING_DEFAULTS: StringDefaultDefinition[] = [
  {
    path: "execution.dockerNetwork",
    current: (settings) => settings.execution.dockerNetwork,
    next: (config) => config.dockerNetwork,
  },
  {
    path: "execution.remoteSyncMode",
    current: (settings) => settings.execution.remoteSyncMode,
    next: (config) => config.remoteSyncMode,
  },
  {
    path: "execution.remoteArtifactPolicy",
    current: (settings) => settings.execution.remoteArtifactPolicy,
    next: (config) => config.remoteArtifactPolicy,
  },
  {
    path: "execution.remoteWorkspaceLabel",
    current: (settings) => settings.execution.remoteWorkspaceLabel,
    next: (config) => config.remoteWorkspaceLabel,
  },
  {
    path: "execution.dockerWorkspacePath",
    current: (settings) => settings.execution.dockerWorkspacePath,
    next: (config) => config.dockerWorkspacePath,
  },
  {
    path: "execution.singularityImage",
    current: (settings) => settings.execution.singularityImage,
    next: (config) => config.singularityImage,
  },
  {
    path: "execution.daytonaTarget",
    current: (settings) => settings.execution.daytonaTarget,
    next: (config) => config.daytonaTarget,
  },
  {
    path: "execution.daytonaCommand",
    current: (settings) => settings.execution.daytonaCommand,
    next: (config) => config.daytonaCommand,
  },
  {
    path: "execution.daytonaShell",
    current: (settings) => settings.execution.daytonaShell,
    next: (config) => config.daytonaShell,
  },
  {
    path: "execution.daytonaWorkspacePath",
    current: (settings) => settings.execution.daytonaWorkspacePath,
    next: (config) => config.daytonaWorkspacePath,
  },
  {
    path: "execution.daytonaSnapshot",
    current: (settings) => settings.execution.daytonaSnapshot,
    next: (config) => config.daytonaSnapshot,
  },
  {
    path: "execution.daytonaBootstrapCommand",
    current: (settings) => settings.execution.daytonaBootstrapCommand,
    next: (config) => config.daytonaBootstrapCommand,
  },
  {
    path: "execution.daytonaStatusCommand",
    current: (settings) => settings.execution.daytonaStatusCommand,
    next: (config) => config.daytonaStatusCommand,
  },
  {
    path: "execution.daytonaInspectCommand",
    current: (settings) => settings.execution.daytonaInspectCommand,
    next: (config) => config.daytonaInspectCommand,
  },
  {
    path: "execution.modalTarget",
    current: (settings) => settings.execution.modalTarget,
    next: (config) => config.modalTarget,
  },
  {
    path: "execution.modalCommand",
    current: (settings) => settings.execution.modalCommand,
    next: (config) => config.modalCommand,
  },
  {
    path: "execution.modalShell",
    current: (settings) => settings.execution.modalShell,
    next: (config) => config.modalShell,
  },
  {
    path: "execution.modalWorkspacePath",
    current: (settings) => settings.execution.modalWorkspacePath,
    next: (config) => config.modalWorkspacePath,
  },
  {
    path: "execution.modalEnvironment",
    current: (settings) => settings.execution.modalEnvironment,
    next: (config) => config.modalEnvironment,
  },
  {
    path: "execution.modalBootstrapCommand",
    current: (settings) => settings.execution.modalBootstrapCommand,
    next: (config) => config.modalBootstrapCommand,
  },
  {
    path: "execution.modalStatusCommand",
    current: (settings) => settings.execution.modalStatusCommand,
    next: (config) => config.modalStatusCommand,
  },
  {
    path: "execution.modalInspectCommand",
    current: (settings) => settings.execution.modalInspectCommand,
    next: (config) => config.modalInspectCommand,
  },
  {
    path: "execution.containerCpuLimit",
    current: (settings) => settings.execution.containerCpuLimit,
    next: (config) => config.containerCpuLimit,
  },
  {
    path: "execution.containerMemoryLimit",
    current: (settings) => settings.execution.containerMemoryLimit,
    next: (config) => config.containerMemoryLimit,
  },
  {
    path: "execution.sshKeyPath",
    current: (settings) => settings.execution.sshKeyPath,
    next: (config) => config.sshKeyPath,
  },
  {
    path: "mcp.serverCommand",
    current: (settings) => settings.mcp.serverCommand,
    next: (config) => config.mcpServerCommand,
  },
];

export const NUMBER_DEFAULTS: NumberDefaultDefinition[] = [
  {
    path: "execution.commandTimeoutMs",
    current: (settings) => settings.execution.commandTimeoutMs,
    next: (config) => config.executionCommandTimeoutMs,
  },
  {
    path: "execution.healthTimeoutMs",
    current: (settings) => settings.execution.healthTimeoutMs,
    next: (config) => config.executionHealthTimeoutMs,
  },
  {
    path: "execution.containerPidsLimit",
    current: (settings) => settings.execution.containerPidsLimit,
    next: (config) => config.containerPidsLimit,
  },
  {
    path: "execution.sshPort",
    current: (settings) => settings.execution.sshPort,
    next: (config) => config.sshPort,
  },
  {
    path: "mcp.timeoutMs",
    current: (settings) => settings.mcp.timeoutMs,
    next: (config) => config.mcpTimeoutMs,
  },
];

export const ARRAY_DEFAULTS: ArrayDefaultDefinition[] = [
  {
    path: "execution.remoteSyncInclude",
    current: (settings) => settings.execution.remoteSyncInclude,
    next: (config) => config.remoteSyncInclude,
  },
  {
    path: "execution.remoteSyncExclude",
    current: (settings) => settings.execution.remoteSyncExclude,
    next: (config) => config.remoteSyncExclude,
  },
  {
    path: "execution.remoteArtifactPaths",
    current: (settings) => settings.execution.remoteArtifactPaths,
    next: (config) => config.remoteArtifactPaths,
  },
  {
    path: "execution.dockerEnvPassthrough",
    current: (settings) => settings.execution.dockerEnvPassthrough,
    next: (config) => config.dockerEnvPassthrough,
  },
];
