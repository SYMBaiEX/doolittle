import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { EnvConfig } from "@/types";
import { SettingsService } from "../../settings-service";
import type { DefaultServiceModelConfig } from "../model/index";
import {
  applyProviderBootstrapFallbacks,
  reconcileElizaCloudBootstrap,
  resolvePersistedProviderAvailability,
} from "./cloud-bootstrap";
import { applyMissingExecutionDefaults } from "./execution-defaults";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "./types";

export function createServiceSettings(
  config: EnvConfig,
  defaults: DefaultServiceModelConfig,
): SettingsService {
  return new SettingsService(config.dataDir, {
    model: {
      provider: defaults.provider,
      model: defaults.defaultModel,
      baseUrl: defaults.defaultBaseUrl,
      temperature: config.openAiTemperature,
      maxTokens: config.openAiMaxTokens,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: config.executionBackend,
      remoteSyncMode: config.remoteSyncMode,
      remoteSyncInclude: config.remoteSyncInclude,
      remoteSyncExclude: config.remoteSyncExclude,
      remoteArtifactPaths: config.remoteArtifactPaths,
      remoteArtifactPolicy: config.remoteArtifactPolicy,
      remoteWorkspaceLabel: config.remoteWorkspaceLabel,
      dockerImage: config.dockerImage,
      dockerNetwork: config.dockerNetwork,
      dockerWorkspacePath: config.dockerWorkspacePath,
      dockerEnvPassthrough: config.dockerEnvPassthrough,
      singularityImage: config.singularityImage,
      daytonaTarget: config.daytonaTarget ?? "",
      daytonaCommand: config.daytonaCommand ?? "",
      daytonaShell: config.daytonaShell ?? "/bin/sh",
      daytonaWorkspacePath: config.daytonaWorkspacePath ?? "/workspace",
      daytonaSnapshot: config.daytonaSnapshot ?? "",
      daytonaBootstrapCommand: config.daytonaBootstrapCommand ?? "",
      daytonaStatusCommand: config.daytonaStatusCommand ?? "",
      daytonaInspectCommand: config.daytonaInspectCommand ?? "",
      modalTarget: config.modalTarget ?? "",
      modalCommand: config.modalCommand ?? "",
      modalShell: config.modalShell ?? "/bin/bash",
      modalWorkspacePath: config.modalWorkspacePath ?? "/workspace",
      modalEnvironment: config.modalEnvironment ?? "",
      modalBootstrapCommand: config.modalBootstrapCommand ?? "",
      modalStatusCommand: config.modalStatusCommand ?? "",
      modalInspectCommand: config.modalInspectCommand ?? "",
      commandTimeoutMs: config.executionCommandTimeoutMs,
      healthTimeoutMs: config.executionHealthTimeoutMs,
      containerCpuLimit: config.containerCpuLimit,
      containerMemoryLimit: config.containerMemoryLimit,
      containerPidsLimit: config.containerPidsLimit,
      containerReadOnlyRoot: config.containerReadOnlyRoot,
      sshHost: config.sshHost ?? "",
      sshUser: config.sshUser ?? "",
      sshPath: config.sshPath ?? "",
      sshPort: config.sshPort,
      sshKeyPath: config.sshKeyPath ?? "",
      sshStrictHostKeyChecking: config.sshStrictHostKeyChecking,
    },
    mcp: {
      serverCommand: config.mcpServerCommand ?? "",
      timeoutMs: config.mcpTimeoutMs,
    },
    agent: {
      runDepth: config.runDepth,
      maxIterations: config.maxIterations,
      toolProgressMode: config.toolProgressMode,
    },
    ui: {
      theme: "orange",
    },
  });
}

export function applyServiceSettingsBootstrap(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  linkedAccounts: LinkedProviderAccountsSnapshot,
  stableElizaCloudSmallModel: string,
  stableElizaCloudLargeModel: string,
  set: SettingsSetter,
): void {
  const availability = resolvePersistedProviderAvailability(
    config,
    currentSettings,
    linkedAccounts,
  );

  reconcileElizaCloudBootstrap(
    config,
    currentSettings,
    stableElizaCloudSmallModel,
    stableElizaCloudLargeModel,
    set,
  );
  applyProviderBootstrapFallbacks(
    config,
    currentSettings,
    linkedAccounts,
    availability,
    set,
  );

  applyMissingExecutionDefaults(config, currentSettings, set);
}
