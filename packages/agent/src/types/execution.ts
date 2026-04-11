export type ExecutionBackendName =
  | "local"
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";

export type ExecutionBackendMode = "local" | "container" | "remote";

export type ExecutionBackendEngine =
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";

export type RemoteWorkspaceSyncMode = "mirror" | "snapshot";
export type RemoteArtifactPolicy = "metadata-only" | "allowlisted";
export type RemoteLifecycleEvent = "preview" | "health" | "run";

export interface TerminalCommandRecord {
  id: string;
  command: string;
  backend: ExecutionBackendName;
  backendMode?: ExecutionBackendMode;
  backendEngine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  executionTarget?: string;
  executionSessionId?: string;
  executionProfile?: ExecutionCloudProfile;
  cwd: string;
  timeoutMs?: number;
  timedOut?: boolean;
  durationMs?: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  preview?: ExecutionBackendPreview;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
}

export interface DiagnosticCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  detail: string;
}

export interface ExecutionBackendHealth {
  backend: ExecutionBackendName;
  mode: ExecutionBackendMode;
  engine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
  ready: boolean;
  detail: string;
  limits: ExecutionBackendLimits;
  diagnostics: string[];
  checks: DiagnosticCheck[];
  bootstrap: string[];
}

export interface ExecutionBackendPreview {
  backend: ExecutionBackendName;
  mode: ExecutionBackendMode;
  engine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
  ready: boolean;
  detail: string;
  cwd: string;
  timeoutMs: number;
  command: string;
  argv: string[];
  diagnostics: string[];
  checks: DiagnosticCheck[];
  bootstrap: string[];
}

export interface ExecutionBackendLimits {
  commandTimeoutMs: number;
  healthTimeoutMs: number;
  containerCpuLimit: string;
  containerMemoryLimit: string;
  containerPidsLimit: number;
  containerReadOnlyRoot: boolean;
}

export interface ExecutionCloudProfile {
  provider: "daytona" | "modal";
  target: string;
  shell: string;
  workspacePath: string;
  state: "persistent-sandbox" | "interactive-shell";
  commandStyle: "exec" | "shell";
  envPassthrough: string[];
  workspaceLabel: string;
  syncPlan: ExecutionRemoteSyncPlan;
  artifactPolicy: RemoteArtifactPolicy;
  artifactPaths: string[];
  snapshot?: string;
  environment?: string;
  bootstrapCommand?: string;
  statusCommand?: string;
  inspectCommand?: string;
}

export interface ExecutionRemoteSyncPlan {
  mode: RemoteWorkspaceSyncMode;
  localWorkspacePath: string;
  remoteWorkspacePath: string;
  workspaceLabel: string;
  include: string[];
  exclude: string[];
  artifactPaths: string[];
  artifactPolicy: RemoteArtifactPolicy;
  safetyNotes: string[];
  generatedAt: string;
}

export interface ExecutionRemoteArtifactRecord {
  artifactId: string;
  provider: "daytona" | "modal";
  target: string;
  workspaceLabel: string;
  path: string;
  kind: "manifest" | "checkpoint" | "report";
  status: "planned" | "available" | "missing";
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionCloudArtifactRecord
  extends ExecutionRemoteArtifactRecord {}

export interface ExecutionCloudSnapshotRecord {
  snapshotId: string;
  provider: "daytona" | "modal";
  target: string;
  workspaceLabel: string;
  event: RemoteLifecycleEvent;
  state: "planned" | "idle" | "ready" | "running" | "failed";
  summary: string;
  commandId?: string;
  command?: string;
  cwd: string;
  workspacePath: string;
  syncPlan: ExecutionRemoteSyncPlan;
  artifacts: ExecutionRemoteArtifactRecord[];
  createdAt: string;
  updatedAt: string;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
}

export interface ExecutionCloudSession {
  sessionId: string;
  provider: "daytona" | "modal";
  target: string;
  profile: ExecutionCloudProfile;
  state: "planned" | "idle" | "ready" | "running" | "failed";
  syncState: "planned" | "synced" | "stale" | "error";
  workspaceLabel: string;
  createdAt: string;
  updatedAt: string;
  lastHealthAt?: string;
  lastPreviewAt?: string;
  lastRunAt?: string;
  lastCommandId?: string;
  lastCommand?: string;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
  lastSnapshotAt?: string;
  lastSnapshotId?: string;
  lastSnapshotSummary?: string;
  snapshotCount: number;
  artifactCount: number;
  syncPlan: ExecutionRemoteSyncPlan;
}
