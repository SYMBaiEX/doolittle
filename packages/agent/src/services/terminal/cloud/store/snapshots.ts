import { randomUUID } from "node:crypto";
import type {
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSnapshotRecord,
} from "@/types/execution";
import { findCloudSession, upsertCloudSession } from "./sessions";
import type { CaptureCloudSnapshotPatch, CloudStore } from "./types";

export function captureCloudSnapshot(
  store: CloudStore,
  profile: ExecutionCloudProfile,
  patch: CaptureCloudSnapshotPatch,
): ExecutionCloudSnapshotRecord {
  const now = new Date().toISOString();
  const existing = findCloudSession(store, profile);
  const sessionState = patch.state === "planned" ? "idle" : patch.state;

  upsertCloudSession(store, profile, {
    ...patch,
    state: sessionState,
    syncState:
      patch.state === "failed" ? "error" : (existing?.syncState ?? "planned"),
    lastCommandId: patch.commandId ?? existing?.lastCommandId,
    lastCommand: patch.command ?? existing?.lastCommand,
    lastSnapshotAt: now,
    lastSnapshotId: patch.commandId ?? existing?.lastSnapshotId,
    lastSnapshotSummary: patch.summary,
  });

  const snapshot: ExecutionCloudSnapshotRecord = {
    snapshotId: randomUUID(),
    provider: profile.provider,
    target: profile.target,
    workspaceLabel: profile.workspaceLabel,
    event: patch.event,
    state: patch.state,
    summary: patch.summary,
    commandId: patch.commandId,
    command: patch.command,
    cwd: patch.cwd,
    workspacePath: profile.workspacePath,
    syncPlan: profile.syncPlan,
    artifacts: buildArtifactManifest(profile, now),
    createdAt: now,
    updatedAt: now,
    lastExitCode: patch.lastExitCode,
    lastStdout: patch.lastStdout,
    lastStderr: patch.lastStderr,
  };

  store.snapshots.push(snapshot);
  if (store.snapshots.length > 40) {
    store.snapshots = store.snapshots.slice(-40);
  }

  store.artifacts.push(...snapshot.artifacts);
  if (store.artifacts.length > 100) {
    store.artifacts = store.artifacts.slice(-100);
  }

  const refreshed = findCloudSession(store, profile);
  if (refreshed) {
    refreshed.snapshotCount = (refreshed.snapshotCount ?? 0) + 1;
    refreshed.artifactCount =
      (refreshed.artifactCount ?? 0) + snapshot.artifacts.length;
    refreshed.syncState = patch.state === "failed" ? "error" : "synced";
    refreshed.lastSnapshotAt = now;
    refreshed.lastSnapshotId = snapshot.snapshotId;
    refreshed.lastSnapshotSummary = snapshot.summary;
    refreshed.updatedAt = now;
  }

  return snapshot;
}

function buildArtifactManifest(
  profile: ExecutionCloudProfile,
  now: string,
): ExecutionCloudArtifactRecord[] {
  return profile.artifactPaths.map((path, index) => ({
    artifactId: randomUUID(),
    provider: profile.provider,
    target: profile.target,
    workspaceLabel: profile.workspaceLabel,
    path,
    kind: index === 0 ? "manifest" : "report",
    status: "planned",
    detail:
      profile.artifactPolicy === "metadata-only"
        ? "Metadata-only remote artifact reference. No file contents are copied or persisted."
        : "Allowlisted remote artifact reference. The runtime only persists metadata and references.",
    createdAt: now,
    updatedAt: now,
  }));
}
