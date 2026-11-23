import type {
  TrajectoryExportOptions,
  TrajectoryRecord,
} from "../../../types/trajectory";
import type { TrajectoryBundleStorageHost } from "./types";

function normalizeMessageRecord(record: TrajectoryRecord): TrajectoryRecord {
  return {
    ...record,
    kind: record.kind ?? "message",
  };
}

function matchesRecord(
  record: TrajectoryRecord,
  options: TrajectoryExportOptions,
): boolean {
  const kind = record.kind ?? "message";
  if (options.sessionId && record.sessionId !== options.sessionId) {
    return false;
  }
  if (options.role && record.role !== options.role) {
    return false;
  }
  if (options.recordKind && kind !== options.recordKind) {
    return false;
  }
  if (options.event && record.event !== options.event) {
    return false;
  }
  if (options.category && record.category !== options.category) {
    return false;
  }
  if (options.runId && record.runId !== options.runId) {
    return false;
  }
  return true;
}

export function collectTrajectoryRecords(
  host: TrajectoryBundleStorageHost,
  options: TrajectoryExportOptions,
): TrajectoryRecord[] {
  const limit = options.limit ?? 100;
  const messages = host.sessions
    .recent(limit, { sessionId: options.sessionId, role: options.role })
    .map(normalizeMessageRecord)
    .filter((record) => matchesRecord(record, options));
  if (options.includeEvents === false) {
    return messages.slice(0, limit);
  }

  const events = host.eventJournal?.recent(limit, options) ?? [];

  return [...messages, ...events]
    .filter((record) => matchesRecord(record, options))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}
