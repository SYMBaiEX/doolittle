import { randomUUID } from "node:crypto";
import type {
  ExecutionCloudProfile,
  ExecutionCloudSession,
} from "@/types/execution";
import type { CloudStore } from "./types";

export function findCloudSession(
  store: CloudStore,
  profile: ExecutionCloudProfile,
): ExecutionCloudSession | undefined {
  return store.sessions.find(
    (session) =>
      session.provider === profile.provider &&
      session.target === profile.target,
  );
}

export function upsertCloudSession(
  store: CloudStore,
  profile: ExecutionCloudProfile,
  patch: Partial<ExecutionCloudSession> = {},
): ExecutionCloudSession {
  const now = new Date().toISOString();
  const existingIndex = store.sessions.findIndex(
    (session) =>
      session.provider === profile.provider &&
      session.target === profile.target,
  );
  const existing =
    existingIndex >= 0 ? store.sessions[existingIndex] : undefined;
  const session: ExecutionCloudSession = {
    sessionId: existing?.sessionId ?? randomUUID(),
    provider: profile.provider,
    target: profile.target,
    profile,
    state: patch.state ?? existing?.state ?? "idle",
    syncState: patch.syncState ?? existing?.syncState ?? "planned",
    workspaceLabel: profile.workspaceLabel,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastHealthAt: patch.lastHealthAt ?? existing?.lastHealthAt,
    lastPreviewAt: patch.lastPreviewAt ?? existing?.lastPreviewAt,
    lastRunAt: patch.lastRunAt ?? existing?.lastRunAt,
    lastCommandId: patch.lastCommandId ?? existing?.lastCommandId,
    lastCommand: patch.lastCommand ?? existing?.lastCommand,
    lastExitCode: patch.lastExitCode ?? existing?.lastExitCode,
    lastStdout: patch.lastStdout ?? existing?.lastStdout,
    lastStderr: patch.lastStderr ?? existing?.lastStderr,
    lastSnapshotAt: patch.lastSnapshotAt ?? existing?.lastSnapshotAt,
    lastSnapshotId: patch.lastSnapshotId ?? existing?.lastSnapshotId,
    lastSnapshotSummary:
      patch.lastSnapshotSummary ?? existing?.lastSnapshotSummary,
    snapshotCount: patch.snapshotCount ?? existing?.snapshotCount ?? 0,
    artifactCount: patch.artifactCount ?? existing?.artifactCount ?? 0,
    syncPlan: profile.syncPlan,
  };
  if (existingIndex >= 0) {
    store.sessions[existingIndex] = session;
  } else {
    store.sessions.push(session);
  }
  if (store.sessions.length > 20) {
    store.sessions = store.sessions.slice(-20);
  }
  return session;
}
