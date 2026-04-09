import type { TrajectoryExportOptions } from "../../../types/trajectory";
import { writeTrajectoryBundleRecords } from "./bundle-writer";
import { collectTrajectoryRecords } from "./record-selection";
import type {
  TrajectoryBundleStorageHost,
  TrajectoryBundleWriteResult,
} from "./types";

export function exportTrajectoryDataset(
  host: TrajectoryBundleStorageHost,
  options: TrajectoryExportOptions = {},
): string {
  const messages = collectTrajectoryRecords(host, options);
  const label = host.slug(
    options.label ?? options.sessionId ?? options.role ?? "recent",
  );
  return collectTrajectoryDataset(host, label, messages, options).dataPath;
}

export function exportTrajectoryBundleRecords(
  host: TrajectoryBundleStorageHost,
  options: TrajectoryExportOptions = {},
): TrajectoryBundleWriteResult {
  const messages = collectTrajectoryRecords(host, options);
  return writeTrajectoryBundleRecords(host, messages, {
    label: options.label ?? options.sessionId ?? options.role ?? "recent",
    purpose: options.purpose ?? "trajectory export",
    mode: options.mode ?? "dataset",
    limit: options.limit ?? 100,
    sessionId: options.sessionId ?? null,
    role: options.role ?? null,
    tags: options.tags,
    notes: options.notes,
  });
}

function collectTrajectoryDataset(
  host: TrajectoryBundleStorageHost,
  label: string,
  messages: ReturnType<typeof collectTrajectoryRecords>,
  options: TrajectoryExportOptions,
): TrajectoryBundleWriteResult {
  return writeTrajectoryBundleRecords(host, messages, {
    label,
    purpose: options.purpose ?? "trajectory export",
    mode: options.mode ?? "dataset",
    limit: options.limit ?? 100,
    sessionId: options.sessionId ?? null,
    role: options.role ?? null,
    tags: options.tags,
    notes: options.notes,
  });
}
