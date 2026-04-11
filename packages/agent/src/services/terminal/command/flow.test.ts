import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExecutionBackendPreview,
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  ExecutionRemoteSyncPlan,
} from "@/types/execution";
import { CloudStoreManager } from "../cloud/store";
import { TerminalCommandHistoryStore } from "../records/history";
import { persistTerminalCommandExecution } from "./flow";

function createLocalPreview(): ExecutionBackendPreview {
  return {
    backend: "local",
    mode: "local",
    ready: true,
    detail: "local",
    cwd: "/tmp",
    timeoutMs: 30_000,
    command: "printf done",
    argv: ["sh", "-lc", "printf done"],
    diagnostics: [],
    checks: [],
    bootstrap: [],
  };
}

function createCloudProfile(): ExecutionCloudProfile {
  const syncPlan: ExecutionRemoteSyncPlan = {
    mode: "mirror",
    localWorkspacePath: "/repo",
    remoteWorkspacePath: "/repo",
    workspaceLabel: "doolittle-workspace",
    include: ["packages/agent/src/**"],
    exclude: [".git", ".doolittle"],
    artifactPaths: [".doolittle/remote-artifacts"],
    artifactPolicy: "metadata-only",
    safetyNotes: [],
    generatedAt: "2026-03-30T00:00:00.000Z",
  };
  return {
    provider: "daytona",
    target: "sandbox-dev",
    shell: "/bin/sh",
    workspacePath: "/workspace",
    state: "persistent-sandbox",
    commandStyle: "exec",
    envPassthrough: [],
    workspaceLabel: "doolittle-workspace",
    syncPlan,
    artifactPolicy: "metadata-only",
    artifactPaths: [".doolittle/remote-artifacts"],
    snapshot: "snapshot-dev",
  };
}

function createCloudSession(
  profile: ExecutionCloudProfile,
): ExecutionCloudSession {
  return {
    sessionId: "session-preview",
    provider: "daytona",
    target: "sandbox-dev",
    profile,
    state: "idle",
    syncState: "planned",
    workspaceLabel: profile.workspaceLabel,
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    syncPlan: profile.syncPlan,
    snapshotCount: 0,
    artifactCount: 0,
  };
}

function createCloudArtifacts(): ExecutionCloudArtifactRecord[] {
  return [
    {
      artifactId: "artifact-manifest",
      provider: "daytona",
      target: "sandbox-dev",
      workspaceLabel: "doolittle-workspace",
      path: ".doolittle/remote-artifacts",
      kind: "manifest",
      status: "planned",
      detail: "Manifest reference",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    },
  ];
}

function createCloudPreview(
  profile: ExecutionCloudProfile,
): ExecutionBackendPreview {
  const artifacts = createCloudArtifacts();
  const snapshot: ExecutionCloudSnapshotRecord = {
    snapshotId: "snapshot-preview",
    provider: "daytona",
    target: "sandbox-dev",
    workspaceLabel: profile.workspaceLabel,
    event: "preview",
    state: "planned",
    summary: "preview started",
    commandId: "cmd-preview",
    command: "printf done",
    cwd: "/repo",
    workspacePath: "/workspace",
    syncPlan: profile.syncPlan,
    artifacts,
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
  };
  return {
    backend: "daytona",
    mode: "remote",
    engine: "daytona",
    target: profile.target,
    cloud: profile,
    cloudSession: createCloudSession(profile),
    cloudSnapshot: snapshot,
    cloudArtifacts: artifacts,
    cloudSyncPlan: profile.syncPlan,
    ready: true,
    detail: "ready",
    cwd: "/repo",
    timeoutMs: 30_000,
    command: "printf done",
    argv: ["daytona"],
    diagnostics: [],
    checks: [],
    bootstrap: [],
  };
}

describe("command flow", () => {
  it("persists local command records through history store", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-flow-local-"));
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const cloudState = new CloudStoreManager(join(root, "cloud-sessions.json"));

    try {
      const { record } = persistTerminalCommandExecution({
        command: "printf 'done'",
        backend: "local",
        preview: createLocalPreview(),
        result: {
          exitCode: 0,
          stdout: "done",
          stderr: "",
          timedOut: false,
          durationMs: 1,
        },
        cwd: "/repo",
        timeoutMs: 30_000,
        startedAt: "2026-03-30T00:00:00.000Z",
        completedAt: "2026-03-30T00:00:00.001Z",
        historyStore,
      });
      const loaded = historyStore.read();
      expect(record.command).toBe("printf 'done'");
      expect(loaded.commands).toHaveLength(1);
      expect(loaded.commands[0]?.command).toBe("printf 'done'");
      expect(cloudState.listSnapshots().length).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refreshes cloud state and persists run records for cloud previews", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-flow-cloud-"));
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const cloudState = new CloudStoreManager(join(root, "cloud-sessions.json"));
    const profile = createCloudProfile();
    const preview = createCloudPreview(profile);

    try {
      const { record, latestCloudSession, latestCloudSnapshot } =
        persistTerminalCommandExecution({
          command: "printf 'done'",
          backend: "daytona",
          preview,
          result: {
            exitCode: 0,
            stdout: "done",
            stderr: "",
            timedOut: false,
            durationMs: 3,
          },
          cwd: "/repo",
          timeoutMs: 30_000,
          startedAt: "2026-03-30T00:00:00.000Z",
          completedAt: "2026-03-30T00:00:00.001Z",
          cloudState,
          historyStore,
        });
      const refreshedSession = cloudState.get(profile);

      expect(record.backend).toBe("daytona");
      expect(record.cloud?.target).toBe("sandbox-dev");
      expect(latestCloudSession?.provider).toBe("daytona");
      expect(latestCloudSession?.target).toBe("sandbox-dev");
      expect(latestCloudSession?.lastCommandId).toBe(record.id);
      expect(latestCloudSnapshot?.snapshotId).toBeDefined();
      expect(refreshedSession?.lastCommandId).toBe(record.id);
      expect(refreshedSession?.lastExitCode).toBe(0);
      expect(refreshedSession?.lastSnapshotId).toBeDefined();
      expect(historyStore.read().commands).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
