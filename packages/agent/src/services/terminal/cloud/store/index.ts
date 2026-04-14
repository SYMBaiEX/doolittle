import type {
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
} from "@/types/execution";
import {
  ensureCloudStoreFile,
  readCloudStore,
  writeCloudStore,
} from "./persistence";
import {
  latestCloudSnapshot,
  listCloudArtifacts,
  listCloudSnapshots,
  listCloudSnapshotsFor,
} from "./queries";
import { findCloudSession, upsertCloudSession } from "./sessions";
import { captureCloudSnapshot } from "./snapshots";
import type { CaptureCloudSnapshotPatch, CloudStateAccessor } from "./types";

export type { CaptureCloudSnapshotPatch, CloudStateAccessor } from "./types";

export class CloudStoreManager implements CloudStateAccessor {
  constructor(private readonly filePath: string) {
    ensureCloudStoreFile(filePath);
  }

  touch(
    profile: ExecutionCloudProfile,
    patch: Partial<ExecutionCloudSession> = {},
  ): ExecutionCloudSession {
    const store = readCloudStore(this.filePath);
    const session = upsertCloudSession(store, profile, patch);
    writeCloudStore(this.filePath, store);
    return session;
  }

  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined {
    return findCloudSession(readCloudStore(this.filePath), profile);
  }

  capture(
    profile: ExecutionCloudProfile,
    patch: CaptureCloudSnapshotPatch,
  ): ExecutionCloudSnapshotRecord {
    const store = readCloudStore(this.filePath);
    const snapshot = captureCloudSnapshot(store, profile, patch);
    writeCloudStore(this.filePath, store);
    return snapshot;
  }

  listSnapshots(limit = 10): ExecutionCloudSnapshotRecord[] {
    return listCloudSnapshots(readCloudStore(this.filePath), limit);
  }

  listSnapshotsFor(
    profile: ExecutionCloudProfile,
    limit = 10,
  ): ExecutionCloudSnapshotRecord[] {
    return listCloudSnapshotsFor(readCloudStore(this.filePath), profile, limit);
  }

  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined {
    return latestCloudSnapshot(readCloudStore(this.filePath), profile);
  }

  listArtifacts(limit = 10) {
    return listCloudArtifacts(readCloudStore(this.filePath), limit);
  }
}
