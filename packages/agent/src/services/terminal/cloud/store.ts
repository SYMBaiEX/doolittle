import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type {
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  RemoteLifecycleEvent,
} from "@/types/execution";

interface CloudStore {
  sessions: ExecutionCloudSession[];
  snapshots: ExecutionCloudSnapshotRecord[];
  artifacts: ExecutionCloudArtifactRecord[];
}

export interface CloudStateAccessor {
  touch(
    profile: ExecutionCloudProfile,
    patch?: Partial<ExecutionCloudSession>,
  ): ExecutionCloudSession;
  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined;
  capture(
    profile: ExecutionCloudProfile,
    patch: {
      event: RemoteLifecycleEvent;
      state: ExecutionCloudSession["state"];
      cwd: string;
      summary: string;
      commandId?: string;
      command?: string;
      lastExitCode?: number;
      lastStdout?: string;
      lastStderr?: string;
    },
  ): ExecutionCloudSnapshotRecord;
  listSnapshots(limit?: number): ExecutionCloudSnapshotRecord[];
  listArtifacts(limit?: number): ExecutionCloudArtifactRecord[];
  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined;
}

export class CloudStoreManager implements CloudStateAccessor {
  constructor(private readonly filePath: string) {
    if (!existsSync(filePath)) {
      this.write({ sessions: [], snapshots: [], artifacts: [] });
    }
  }

  touch(
    profile: ExecutionCloudProfile,
    patch: Partial<ExecutionCloudSession> = {},
  ): ExecutionCloudSession {
    const store = this.readStore();
    const session = this.upsertSession(store, profile, patch);
    this.write(store);
    return session;
  }

  capture(
    profile: ExecutionCloudProfile,
    patch: {
      event: RemoteLifecycleEvent;
      state: ExecutionCloudSession["state"];
      cwd: string;
      summary: string;
      commandId?: string;
      command?: string;
      lastExitCode?: number;
      lastStdout?: string;
      lastStderr?: string;
    },
  ): ExecutionCloudSnapshotRecord {
    const store = this.readStore();
    const now = new Date().toISOString();
    const existing = this.findSession(store, profile);
    const sessionState = patch.state === "planned" ? "idle" : patch.state;
    this.upsertSession(store, profile, {
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
      artifacts: this.buildArtifactManifest(profile, now),
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
    const refreshed = this.findSession(store, profile);
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
    this.write(store);
    return snapshot;
  }

  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined {
    return this.findSession(this.readStore(), profile);
  }

  listSnapshots(limit = 10): ExecutionCloudSnapshotRecord[] {
    return this.readStore().snapshots.slice(-limit).reverse();
  }

  listSnapshotsFor(
    profile: ExecutionCloudProfile,
    limit = 10,
  ): ExecutionCloudSnapshotRecord[] {
    return this.readStore()
      .snapshots.filter(
        (snapshot) =>
          snapshot.provider === profile.provider &&
          snapshot.target === profile.target,
      )
      .slice(-limit)
      .reverse();
  }

  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined {
    return this.listSnapshotsFor(profile, 1)[0];
  }

  listArtifacts(limit = 10): ExecutionCloudArtifactRecord[] {
    return this.readStore().artifacts.slice(-limit).reverse();
  }

  private readStore(): CloudStore {
    const store = JSON.parse(
      readFileSync(this.filePath, "utf8"),
    ) as Partial<CloudStore>;
    return {
      sessions: store.sessions ?? [],
      snapshots: store.snapshots ?? [],
      artifacts: store.artifacts ?? [],
    };
  }

  private write(store: CloudStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private findSession(
    store: CloudStore,
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSession | undefined {
    return store.sessions.find(
      (session) =>
        session.provider === profile.provider &&
        session.target === profile.target,
    );
  }

  private upsertSession(
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

  private buildArtifactManifest(
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
}
