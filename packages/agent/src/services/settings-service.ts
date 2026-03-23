import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { TuiThemeName } from "@/runtime/theme-catalog";
import type {
  ExecutionBackendName,
  RemoteArtifactPolicy,
  RemoteWorkspaceSyncMode,
  RunDepth,
  ToolProgressMode,
} from "@/types";

export interface RuntimeSettings {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  gateway: {
    sessionTimeoutMinutes: number;
    mirrorResponsesToHistory: boolean;
  };
  execution: {
    backend: ExecutionBackendName;
    remoteSyncMode: RemoteWorkspaceSyncMode;
    remoteSyncInclude: string[];
    remoteSyncExclude: string[];
    remoteArtifactPaths: string[];
    remoteArtifactPolicy: RemoteArtifactPolicy;
    remoteWorkspaceLabel: string;
    dockerImage: string;
    dockerNetwork: string;
    dockerWorkspacePath: string;
    dockerEnvPassthrough: string[];
    singularityImage: string;
    daytonaTarget: string;
    daytonaCommand: string;
    daytonaShell: string;
    daytonaWorkspacePath: string;
    daytonaSnapshot: string;
    daytonaBootstrapCommand: string;
    daytonaStatusCommand: string;
    daytonaInspectCommand: string;
    modalTarget: string;
    modalCommand: string;
    modalShell: string;
    modalWorkspacePath: string;
    modalEnvironment: string;
    modalBootstrapCommand: string;
    modalStatusCommand: string;
    modalInspectCommand: string;
    commandTimeoutMs?: number;
    healthTimeoutMs?: number;
    containerCpuLimit?: string;
    containerMemoryLimit?: string;
    containerPidsLimit?: number;
    containerReadOnlyRoot?: boolean;
    sshHost: string;
    sshUser: string;
    sshPath: string;
    sshPort: number;
    sshKeyPath: string;
    sshStrictHostKeyChecking: boolean;
  };
  mcp: {
    serverCommand: string;
    timeoutMs: number;
  };
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  ui: {
    theme: TuiThemeName;
  };
}

export class SettingsService {
  private readonly filePath: string;
  private readonly defaults: RuntimeSettings;

  constructor(baseDir: string, defaults: RuntimeSettings) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "settings.json");
    this.defaults = defaults;
    if (!existsSync(this.filePath)) {
      this.write(defaults);
    }
  }

  get(): RuntimeSettings {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as RuntimeSettings & {
      execution?: Partial<RuntimeSettings["execution"]>;
    };
    let dirty = false;
    if (parsed.model.provider === "openai-compatible") {
      parsed.model.provider = "openai";
      dirty = true;
    }
    const execution = parsed.execution;
    if (!execution) {
      parsed.execution = {
        ...this.defaults.execution,
      };
      dirty = true;
    } else {
      if (execution.remoteSyncMode === undefined) {
        parsed.execution.remoteSyncMode =
          this.defaults.execution.remoteSyncMode;
        dirty = true;
      }
      if (
        !Array.isArray(execution.remoteSyncInclude) ||
        execution.remoteSyncInclude.length === 0
      ) {
        parsed.execution.remoteSyncInclude =
          this.defaults.execution.remoteSyncInclude;
        dirty = true;
      }
      if (
        !Array.isArray(execution.remoteSyncExclude) ||
        execution.remoteSyncExclude.length === 0
      ) {
        parsed.execution.remoteSyncExclude =
          this.defaults.execution.remoteSyncExclude;
        dirty = true;
      }
      if (
        !Array.isArray(execution.remoteArtifactPaths) ||
        execution.remoteArtifactPaths.length === 0
      ) {
        parsed.execution.remoteArtifactPaths =
          this.defaults.execution.remoteArtifactPaths;
        dirty = true;
      }
      if (execution.remoteArtifactPolicy === undefined) {
        parsed.execution.remoteArtifactPolicy =
          this.defaults.execution.remoteArtifactPolicy;
        dirty = true;
      }
      if (execution.remoteWorkspaceLabel === undefined) {
        parsed.execution.remoteWorkspaceLabel =
          this.defaults.execution.remoteWorkspaceLabel;
        dirty = true;
      }
      if (execution.dockerNetwork === undefined) {
        parsed.execution.dockerNetwork = this.defaults.execution.dockerNetwork;
        dirty = true;
      }
      if (execution.dockerWorkspacePath === undefined) {
        parsed.execution.dockerWorkspacePath =
          this.defaults.execution.dockerWorkspacePath;
        dirty = true;
      }
      if (!Array.isArray(execution.dockerEnvPassthrough)) {
        parsed.execution.dockerEnvPassthrough =
          this.defaults.execution.dockerEnvPassthrough;
        dirty = true;
      }
      if (execution.singularityImage === undefined) {
        parsed.execution.singularityImage =
          this.defaults.execution.singularityImage;
        dirty = true;
      }
      if (execution.daytonaTarget === undefined) {
        parsed.execution.daytonaTarget = this.defaults.execution.daytonaTarget;
        dirty = true;
      }
      if (execution.daytonaCommand === undefined) {
        parsed.execution.daytonaCommand =
          this.defaults.execution.daytonaCommand;
        dirty = true;
      }
      if (execution.daytonaShell === undefined) {
        parsed.execution.daytonaShell = this.defaults.execution.daytonaShell;
        dirty = true;
      }
      if (execution.daytonaWorkspacePath === undefined) {
        parsed.execution.daytonaWorkspacePath =
          this.defaults.execution.daytonaWorkspacePath;
        dirty = true;
      }
      if (execution.daytonaSnapshot === undefined) {
        parsed.execution.daytonaSnapshot =
          this.defaults.execution.daytonaSnapshot;
        dirty = true;
      }
      if (execution.daytonaBootstrapCommand === undefined) {
        parsed.execution.daytonaBootstrapCommand =
          this.defaults.execution.daytonaBootstrapCommand;
        dirty = true;
      }
      if (execution.daytonaStatusCommand === undefined) {
        parsed.execution.daytonaStatusCommand =
          this.defaults.execution.daytonaStatusCommand;
        dirty = true;
      }
      if (execution.daytonaInspectCommand === undefined) {
        parsed.execution.daytonaInspectCommand =
          this.defaults.execution.daytonaInspectCommand;
        dirty = true;
      }
      if (execution.modalTarget === undefined) {
        parsed.execution.modalTarget = this.defaults.execution.modalTarget;
        dirty = true;
      }
      if (execution.modalCommand === undefined) {
        parsed.execution.modalCommand = this.defaults.execution.modalCommand;
        dirty = true;
      }
      if (execution.modalShell === undefined) {
        parsed.execution.modalShell = this.defaults.execution.modalShell;
        dirty = true;
      }
      if (execution.modalWorkspacePath === undefined) {
        parsed.execution.modalWorkspacePath =
          this.defaults.execution.modalWorkspacePath;
        dirty = true;
      }
      if (execution.modalEnvironment === undefined) {
        parsed.execution.modalEnvironment =
          this.defaults.execution.modalEnvironment;
        dirty = true;
      }
      if (execution.modalBootstrapCommand === undefined) {
        parsed.execution.modalBootstrapCommand =
          this.defaults.execution.modalBootstrapCommand;
        dirty = true;
      }
      if (execution.modalStatusCommand === undefined) {
        parsed.execution.modalStatusCommand =
          this.defaults.execution.modalStatusCommand;
        dirty = true;
      }
      if (execution.modalInspectCommand === undefined) {
        parsed.execution.modalInspectCommand =
          this.defaults.execution.modalInspectCommand;
        dirty = true;
      }
      if (execution.commandTimeoutMs === undefined) {
        parsed.execution.commandTimeoutMs =
          this.defaults.execution.commandTimeoutMs;
        dirty = true;
      }
      if (execution.healthTimeoutMs === undefined) {
        parsed.execution.healthTimeoutMs =
          this.defaults.execution.healthTimeoutMs;
        dirty = true;
      }
      if (execution.containerCpuLimit === undefined) {
        parsed.execution.containerCpuLimit =
          this.defaults.execution.containerCpuLimit;
        dirty = true;
      }
      if (execution.containerMemoryLimit === undefined) {
        parsed.execution.containerMemoryLimit =
          this.defaults.execution.containerMemoryLimit;
        dirty = true;
      }
      if (execution.containerPidsLimit === undefined) {
        parsed.execution.containerPidsLimit =
          this.defaults.execution.containerPidsLimit;
        dirty = true;
      }
      if (execution.containerReadOnlyRoot === undefined) {
        parsed.execution.containerReadOnlyRoot =
          this.defaults.execution.containerReadOnlyRoot;
        dirty = true;
      }
      if (execution.sshHost === undefined) {
        parsed.execution.sshHost = this.defaults.execution.sshHost;
        dirty = true;
      }
      if (execution.sshUser === undefined) {
        parsed.execution.sshUser = this.defaults.execution.sshUser;
        dirty = true;
      }
      if (execution.sshPath === undefined) {
        parsed.execution.sshPath = this.defaults.execution.sshPath;
        dirty = true;
      }
      if (execution.sshPort === undefined) {
        parsed.execution.sshPort = this.defaults.execution.sshPort;
        dirty = true;
      }
      if (execution.sshKeyPath === undefined) {
        parsed.execution.sshKeyPath = this.defaults.execution.sshKeyPath;
        dirty = true;
      }
      if (execution.sshStrictHostKeyChecking === undefined) {
        parsed.execution.sshStrictHostKeyChecking =
          this.defaults.execution.sshStrictHostKeyChecking;
        dirty = true;
      }
    }
    if (!parsed.mcp) {
      parsed.mcp = { ...this.defaults.mcp };
      dirty = true;
    } else {
      if (parsed.mcp.serverCommand === undefined) {
        parsed.mcp.serverCommand = this.defaults.mcp.serverCommand;
        dirty = true;
      }
      if (parsed.mcp.timeoutMs === undefined) {
        parsed.mcp.timeoutMs = this.defaults.mcp.timeoutMs;
        dirty = true;
      }
    }
    if (!parsed.agent || typeof parsed.agent !== "object") {
      parsed.agent = { ...this.defaults.agent };
      dirty = true;
    } else {
      if (parsed.agent.runDepth === undefined) {
        parsed.agent.runDepth = this.defaults.agent.runDepth;
        dirty = true;
      }
      if (parsed.agent.maxIterations === undefined) {
        parsed.agent.maxIterations = this.defaults.agent.maxIterations;
        dirty = true;
      }
      if (parsed.agent.toolProgressMode === undefined) {
        parsed.agent.toolProgressMode = this.defaults.agent.toolProgressMode;
        dirty = true;
      }
    }
    if (!parsed.ui || typeof parsed.ui !== "object") {
      parsed.ui = { ...this.defaults.ui };
      dirty = true;
    } else if (!parsed.ui.theme) {
      parsed.ui.theme = this.defaults.ui.theme;
      dirty = true;
    }
    if (dirty) {
      this.write(parsed);
    }
    return parsed as RuntimeSettings;
  }

  set(path: string, value: unknown): RuntimeSettings {
    const settings = this.get();
    const segments = path.split(".");
    let current = settings as unknown as Record<string, unknown>;

    while (segments.length > 1) {
      const segment = segments.shift();
      if (!segment) {
        break;
      }
      const next = current[segment];
      if (!next || typeof next !== "object") {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    const leaf = segments[0];
    current[leaf] = value;
    this.write(settings);
    return settings;
  }

  private write(settings: RuntimeSettings): void {
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
  }
}
