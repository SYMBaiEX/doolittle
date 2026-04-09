import type {
  ExecutionBackendPreview,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  TerminalCommandRecord,
} from "@/types/execution";
import type { CloudStateAccessor } from "../cloud/store";
import type { TerminalRunResult } from "../execution/subprocess";
import { buildTerminalCommandRecord } from "../records/command";
import type { TerminalCommandHistoryStore } from "../records/history";

export interface PersistTerminalCommandInput {
  command: string;
  backend: TerminalCommandRecord["backend"];
  preview: ExecutionBackendPreview;
  result: TerminalRunResult;
  cwd: string;
  timeoutMs: number;
  startedAt: string;
  completedAt: string;
  cloudState?: CloudStateAccessor;
  historyStore: TerminalCommandHistoryStore;
}

export interface PersistTerminalCommandResult {
  record: TerminalCommandRecord;
  latestCloudSnapshot?: ExecutionCloudSnapshotRecord;
  latestCloudSession?: ExecutionCloudSession;
}

function resolveCloudSnapshotAndSession(
  preview: ExecutionBackendPreview,
  cloudState?: CloudStateAccessor,
): {
  latestCloudSnapshot?: ExecutionCloudSnapshotRecord;
  latestCloudSession?: ExecutionCloudSession;
} {
  if (!preview.cloud) {
    return {
      latestCloudSnapshot: preview.cloudSnapshot,
      latestCloudSession: preview.cloudSession,
    };
  }

  return {
    latestCloudSnapshot:
      cloudState?.latestSnapshot(preview.cloud) ?? preview.cloudSnapshot,
    latestCloudSession: cloudState?.get(preview.cloud) ?? preview.cloudSession,
  };
}

export function persistTerminalCommandExecution(
  input: PersistTerminalCommandInput,
): PersistTerminalCommandResult {
  const {
    command,
    backend,
    preview,
    result,
    cwd,
    timeoutMs,
    startedAt,
    completedAt,
  } = input;
  const { latestCloudSnapshot, latestCloudSession } =
    resolveCloudSnapshotAndSession(preview, input.cloudState);

  const record = buildTerminalCommandRecord({
    command,
    backend,
    preview,
    result,
    cwd,
    timeoutMs,
    startedAt,
    completedAt,
    latestCloudSnapshot,
    latestCloudSession,
  });

  let resolvedCloudSession = latestCloudSession;
  if (record.cloud?.provider && record.cloudSession && input.cloudState) {
    resolvedCloudSession = input.cloudState.touch(record.cloud, {
      state: record.exitCode === 0 ? "ready" : "failed",
      lastRunAt: completedAt,
      lastCommandId: record.id,
      lastCommand: record.command,
      lastExitCode: record.exitCode,
      lastStdout: record.stdout,
      lastStderr: record.stderr,
      lastSnapshotId: latestCloudSnapshot?.snapshotId,
      lastSnapshotAt: latestCloudSnapshot?.createdAt,
      lastSnapshotSummary: latestCloudSnapshot?.summary,
    });
  }

  input.historyStore.append(record);

  return {
    record,
    latestCloudSnapshot,
    latestCloudSession: resolvedCloudSession,
  };
}
