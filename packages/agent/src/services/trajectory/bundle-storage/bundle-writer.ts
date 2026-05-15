import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TrajectoryRecord } from "../../../types/trajectory";
import type {
  TrajectoryBundleStorageHost,
  TrajectoryBundleWriteOptions,
  TrajectoryBundleWriteResult,
} from "./types";

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function writeTrajectoryBundleRecords(
  host: TrajectoryBundleStorageHost,
  messages: TrajectoryRecord[],
  options: TrajectoryBundleWriteOptions,
): TrajectoryBundleWriteResult {
  const label = host.slug(options.label);
  const stamp = Date.now();
  const createdAt = new Date().toISOString();
  const dataPath = join(host.baseDir, `trajectory-${stamp}-${label}.jsonl`);
  const manifestPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-manifest.json`,
  );
  const summaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-summary.md`,
  );
  const roleCounts = messages.reduce<Record<string, number>>(
    (counts, message) => {
      counts[message.role] = (counts[message.role] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const recordKindCounts = messages.reduce<Record<string, number>>(
    (counts, message) => {
      const kind = message.kind ?? "message";
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const eventCount = recordKindCounts.event ?? 0;
  const messageRecordCount = messages.length - eventCount;
  const sessions = unique(messages.map((message) => message.sessionId));
  const trainingCompatible = false;
  const trainingFormat = "doolittle-debug" as const;
  const trainingNotes =
    "Doolittle trace bundles are debug/evaluation artifacts. Use ElizaOS SDK trajectory export for model training.";

  writeFileSync(
    dataPath,
    messages.map((message) => JSON.stringify(message)).join("\n"),
    "utf8",
  );

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt,
        label,
        purpose: options.purpose,
        mode: options.mode,
        tags: options.tags ?? [],
        notes: options.notes,
        limit: options.limit,
        manifestPath,
        filters: {
          sessionId: options.sessionId ?? null,
          role: options.role ?? null,
        },
        dataPath,
        summaryPath,
        recordCount: messages.length,
        messageCount: messages.length,
        messageRecordCount,
        eventCount,
        trainingCompatible,
        trainingFormat,
        trainingNotes,
        sessionCount: sessions.length,
        sessions,
        roleCounts,
        recordKindCounts,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    summaryPath,
    [
      `# Trajectory Bundle: ${label}`,
      "",
      `- Created: ${createdAt}`,
      `- Mode: ${options.mode}`,
      `- Purpose: ${options.purpose}`,
      ...(options.tags?.length ? [`- Tags: ${options.tags.join(", ")}`] : []),
      ...(options.notes ? [`- Notes: ${options.notes}`] : []),
      `- Records: ${messages.length}`,
      `- Messages: ${messages.length}`,
      `- Message records: ${messageRecordCount}`,
      `- Event records: ${eventCount}`,
      `- Training compatible: ${trainingCompatible}`,
      `- Training format: ${trainingFormat}`,
      `- Training notes: ${trainingNotes}`,
      `- Sessions: ${sessions.length}`,
      `- Filters: session=${options.sessionId ?? "any"}, role=${options.role ?? "any"}, limit=${options.limit}`,
      "",
      "## Role Counts",
      ...Object.entries(roleCounts).map(
        ([role, count]) => `- ${role}: ${count}`,
      ),
      "",
      "## Record Kinds",
      ...Object.entries(recordKindCounts).map(
        ([kind, count]) => `- ${kind}: ${count}`,
      ),
      "",
      "## Sessions",
      ...(sessions.length
        ? sessions.map((sessionId) => `- ${sessionId}`)
        : ["- (none)"]),
    ].join("\n"),
    "utf8",
  );

  return {
    dataPath,
    manifestPath,
    summaryPath,
    messageCount: messages.length,
    trainingCompatible,
    trainingFormat,
    trainingNotes,
    sessionCount: sessions.length,
  };
}
