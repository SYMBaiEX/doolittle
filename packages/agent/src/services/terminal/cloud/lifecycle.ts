import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
} from "@/types/execution";
import type { TerminalRunResult } from "../execution/subprocess";
import type { CloudStateAccessor } from "./store";

function refreshCloudSession(
  cloudState: CloudStateAccessor,
  cloud: ExecutionCloudProfile,
  fallback: ExecutionCloudSession,
): ExecutionCloudSession {
  return cloudState.get(cloud) ?? fallback;
}

export function touchCloudHealthSession(
  cloudState: CloudStateAccessor,
  cloud: ExecutionCloudProfile,
  ready: boolean,
): ExecutionCloudSession {
  return cloudState.touch(cloud, {
    state: ready ? "ready" : "failed",
    lastHealthAt: new Date().toISOString(),
  });
}

interface CloudPreviewLifecycleInput {
  backend: ExecutionCloudProfile["provider"];
  cloudState: CloudStateAccessor;
  cloud: ExecutionCloudProfile;
  command: string;
  cwd: string;
  timeoutMs: number;
  argv: string[];
  detail: string;
  summary: string;
  ready: boolean;
  checks: ExecutionBackendPreview["checks"];
  diagnostics: ExecutionBackendPreview["diagnostics"];
  bootstrap: ExecutionBackendPreview["bootstrap"];
}

export function buildCloudPreviewLifecycle(
  input: CloudPreviewLifecycleInput,
): ExecutionBackendPreview {
  const cloudSession = input.cloudState.touch(input.cloud, {
    state: "idle",
    lastPreviewAt: new Date().toISOString(),
    lastCommand: input.command,
  });
  const cloudSnapshot = input.cloudState.capture(input.cloud, {
    event: "preview",
    state: "planned",
    cwd: input.cwd,
    summary: input.summary,
    command: input.command,
  });
  const refreshedSession = refreshCloudSession(
    input.cloudState,
    input.cloud,
    cloudSession,
  );
  return {
    backend: input.backend,
    mode: "remote",
    engine: input.backend,
    cloud: input.cloud,
    cloudSession: refreshedSession,
    cloudSnapshot,
    cloudArtifacts: cloudSnapshot.artifacts,
    cloudSyncPlan: input.cloud.syncPlan,
    target: input.cloud.target,
    ready: input.ready,
    detail: input.detail,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    command: input.command,
    argv: input.argv,
    diagnostics: input.diagnostics,
    checks: input.checks,
    bootstrap: input.bootstrap,
  };
}

interface CloudUnavailableHealthInput {
  backend: ExecutionCloudProfile["provider"];
  cloudState: CloudStateAccessor;
  cloud: ExecutionCloudProfile;
  workspaceDir: string;
  binary: string;
  summary: string;
  detail: string;
  checks: ExecutionBackendHealth["checks"];
  diagnostics: ExecutionBackendHealth["diagnostics"];
  bootstrap: ExecutionBackendHealth["bootstrap"];
  limits: ExecutionBackendHealth["limits"];
}

export function buildUnavailableCloudHealth(
  input: CloudUnavailableHealthInput,
): ExecutionBackendHealth {
  const cloudSession = touchCloudHealthSession(
    input.cloudState,
    input.cloud,
    false,
  );
  const cloudSnapshot = input.cloudState.capture(input.cloud, {
    event: "health",
    state: "failed",
    cwd: input.workspaceDir,
    summary: input.summary,
    commandId: input.binary,
    command: input.binary,
    lastExitCode: 1,
    lastStderr: input.detail,
  });
  const refreshedSession = refreshCloudSession(
    input.cloudState,
    input.cloud,
    cloudSession,
  );
  return {
    backend: input.backend,
    mode: "remote",
    engine: input.backend,
    cloud: input.cloud,
    cloudSession: refreshedSession,
    cloudSnapshot,
    cloudArtifacts: cloudSnapshot.artifacts,
    cloudSyncPlan: input.cloud.syncPlan,
    target: input.cloud.target,
    ready: false,
    detail: input.detail,
    limits: input.limits,
    diagnostics: input.diagnostics,
    checks: input.checks,
    bootstrap: input.bootstrap,
  };
}

interface CloudRunLifecycleInput {
  cloudState: CloudStateAccessor;
  cloud: ExecutionCloudProfile;
  command: string;
  cwd: string;
  result: TerminalRunResult;
  successSummary: string;
  failureSummary: string;
}

export function recordCloudRunLifecycle(input: CloudRunLifecycleInput): {
  cloudSession: ExecutionCloudSession;
  cloudSnapshot: ExecutionCloudSnapshotRecord;
} {
  const startedSession = input.cloudState.touch(input.cloud, {
    state: "running",
    lastRunAt: new Date().toISOString(),
    lastCommand: input.command,
  });
  const state = input.result.exitCode === 0 ? "ready" : "failed";
  const cloudSnapshot = input.cloudState.capture(input.cloud, {
    event: "run",
    state,
    cwd: input.cwd,
    summary:
      input.result.exitCode === 0 ? input.successSummary : input.failureSummary,
    command: input.command,
    commandId: startedSession.lastCommandId,
    lastExitCode: input.result.exitCode,
    lastStdout: input.result.stdout,
    lastStderr: input.result.stderr,
  });
  const cloudSession = input.cloudState.touch(input.cloud, {
    state,
    lastRunAt: new Date().toISOString(),
    lastCommandId: startedSession.lastCommandId,
    lastCommand: input.command,
    lastExitCode: input.result.exitCode,
    lastStdout: input.result.stdout,
    lastStderr: input.result.stderr,
  });
  return { cloudSession, cloudSnapshot };
}
