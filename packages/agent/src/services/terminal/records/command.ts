import { randomUUID } from "node:crypto";
import type {
  ExecutionBackendPreview,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  TerminalCommandRecord,
} from "@/types/execution";
import type { TerminalRunResult } from "../execution/subprocess";

export interface TerminalStore {
  commands: TerminalCommandRecord[];
}

export interface BuildTerminalCommandRecordInput {
  command: string;
  backend: TerminalCommandRecord["backend"];
  preview: ExecutionBackendPreview;
  result: TerminalRunResult;
  cwd: string;
  timeoutMs: number;
  startedAt: string;
  completedAt: string;
  latestCloudSnapshot?: ExecutionCloudSnapshotRecord;
  latestCloudSession?: ExecutionCloudSession;
}

export function buildTerminalCommandRecord(
  input: BuildTerminalCommandRecordInput,
): TerminalCommandRecord {
  const cloudSession = input.latestCloudSession ?? input.preview.cloudSession;
  const cloudSnapshot =
    input.latestCloudSnapshot ?? input.preview.cloudSnapshot;
  return {
    id: randomUUID(),
    command: input.command,
    backend: input.backend,
    backendMode: input.preview.mode,
    backendEngine: input.preview.engine,
    cloud: input.preview.cloud,
    cloudSession,
    cloudSnapshot,
    cloudArtifacts: cloudSnapshot?.artifacts ?? input.preview.cloudArtifacts,
    cloudSyncPlan: input.preview.cloudSyncPlan,
    executionTarget: input.preview.target ?? input.preview.cloud?.target,
    executionSessionId: cloudSession?.sessionId,
    executionProfile: input.preview.cloud,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    timedOut: input.result.timedOut,
    durationMs: input.result.durationMs,
    exitCode: input.result.exitCode,
    stdout: input.result.stdout,
    stderr: input.result.stderr,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    preview: input.preview,
  };
}

export function appendCommandRecord(
  store: TerminalStore,
  record: TerminalCommandRecord,
  limit = 100,
): TerminalStore {
  return {
    commands: [...store.commands, record].slice(-limit),
  };
}
