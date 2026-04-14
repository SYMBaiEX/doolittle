import type {
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSnapshotRecord,
} from "@/types/execution";
import type { CloudStore } from "./types";

export function listCloudSnapshots(
  store: CloudStore,
  limit = 10,
): ExecutionCloudSnapshotRecord[] {
  return store.snapshots.slice(-limit).reverse();
}

export function listCloudSnapshotsFor(
  store: CloudStore,
  profile: ExecutionCloudProfile,
  limit = 10,
): ExecutionCloudSnapshotRecord[] {
  return store.snapshots
    .filter(
      (snapshot) =>
        snapshot.provider === profile.provider &&
        snapshot.target === profile.target,
    )
    .slice(-limit)
    .reverse();
}

export function latestCloudSnapshot(
  store: CloudStore,
  profile: ExecutionCloudProfile,
): ExecutionCloudSnapshotRecord | undefined {
  return listCloudSnapshotsFor(store, profile, 1)[0];
}

export function listCloudArtifacts(
  store: CloudStore,
  limit = 10,
): ExecutionCloudArtifactRecord[] {
  return store.artifacts.slice(-limit).reverse();
}
