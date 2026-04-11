import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryRecord,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops-types";

function buildTrajectoryReplayPayload(
  manifest: TrajectoryReplayResult,
  records: TrajectoryRecord[],
  replayPath: string,
) {
  return {
    createdAt: new Date().toISOString(),
    sourceManifestPath: manifest.manifestPath,
    sourceDataPath: manifest.dataPath,
    replayCount: records.length,
    sessions: manifest.sessions,
    roleCounts: manifest.roleCounts,
    replayPreview: manifest.replayPreview,
    messages: records,
    replayPath,
  };
}

export function buildTrajectoryReplaySummary(
  replay: TrajectoryReplayResult,
): string {
  return [
    `# Trajectory Replay: ${replay.label}`,
    "",
    `- Source manifest: ${replay.manifestPath}`,
    `- Source data: ${replay.dataPath}`,
    `- Replay file: ${replay.replayPath}`,
    `- Messages: ${replay.replayCount}`,
    `- Sessions: ${replay.sessions.length}`,
    "",
    "## Replay Preview",
    ...(replay.replayPreview.length
      ? replay.replayPreview.map(
          (message) =>
            `- [${message.role}] ${message.sessionId} @ ${message.createdAt}: ${message.text}`,
        )
      : ["- (none)"]),
  ].join("\n");
}

export function replayTrajectoryBundle(
  host: TrajectoryBundleOperationsHost,
  manifestPath: string,
): TrajectoryReplayResult {
  const manifest = host.describeBundle(manifestPath);
  const records = host.readRecords(manifest.dataPath) as TrajectoryRecord[];
  const stamp = Date.now();
  const label = host.slug(`${manifest.label}-replay`);
  const replayPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}.replay.json`,
  );
  const replaySummaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-replay.md`,
  );
  const replayPreview = records.slice(0, 20);
  const replay: TrajectoryReplayResult = {
    ...manifest,
    replayPath,
    replaySummaryPath,
    replayCount: records.length,
    replayPreview,
  };

  writeFileSync(
    replayPath,
    JSON.stringify(
      buildTrajectoryReplayPayload(replay, records, replayPath),
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    replaySummaryPath,
    buildTrajectoryReplaySummary(replay),
    "utf8",
  );

  return replay;
}
