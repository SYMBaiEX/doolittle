import type {
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  RemoteLifecycleEvent,
} from "@/types/execution";

export interface CloudStore {
  sessions: ExecutionCloudSession[];
  snapshots: ExecutionCloudSnapshotRecord[];
  artifacts: ExecutionCloudArtifactRecord[];
}

export interface CaptureCloudSnapshotPatch {
  event: RemoteLifecycleEvent;
  state: ExecutionCloudSession["state"];
  cwd: string;
  summary: string;
  commandId?: string;
  command?: string;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
}

export interface CloudStateAccessor {
  touch(
    profile: ExecutionCloudProfile,
    patch?: Partial<ExecutionCloudSession>,
  ): ExecutionCloudSession;
  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined;
  capture(
    profile: ExecutionCloudProfile,
    patch: CaptureCloudSnapshotPatch,
  ): ExecutionCloudSnapshotRecord;
  listSnapshots(limit?: number): ExecutionCloudSnapshotRecord[];
  listArtifacts(limit?: number): ExecutionCloudArtifactRecord[];
  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined;
}
