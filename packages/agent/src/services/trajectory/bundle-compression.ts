import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBundleEntry,
  TrajectoryCompressionBundle,
  TrajectoryRecord,
} from "../../types/trajectory";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops-types";
import { replayTrajectoryBundle } from "./bundle-replay";

export function buildTrajectorySessionBlocks(
  records: TrajectoryRecord[],
  sampleCount: number,
): TrajectoryCompressionBundle["sessionBlocks"] {
  const grouped = new Map<string, TrajectoryRecord[]>();
  for (const record of records) {
    const list = grouped.get(record.sessionId) ?? [];
    list.push(record);
    grouped.set(record.sessionId, list);
  }

  return Array.from(grouped.entries())
    .map(([sessionId, turns]) => ({
      sessionId,
      turns: turns.length,
      preview: turns
        .slice(0, sampleCount)
        .map((turn) => `[${turn.role}] ${turn.text.slice(0, 180)}`),
    }))
    .sort((a, b) => b.turns - a.turns);
}

export function buildTrajectoryCompressionFindings(
  bundle: TrajectoryBundleEntry,
  sessionBlocks: TrajectoryCompressionBundle["sessionBlocks"],
  recordCount: number,
): string[] {
  return [
    `Compressed ${recordCount} messages across ${sessionBlocks.length} sessions.`,
    bundle.tags?.length
      ? `Bundle tags: ${bundle.tags.join(", ")}.`
      : "Bundle tags: none.",
    `Largest session: ${sessionBlocks[0]?.sessionId ?? "n/a"} (${sessionBlocks[0]?.turns ?? 0} turns).`,
  ];
}

export function compressTrajectoryBundle(
  host: TrajectoryBundleOperationsHost,
  manifestPath: string,
  options: {
    sampleCount?: number;
  } = {},
): TrajectoryCompressionBundle {
  const bundle = host.describeBundle(manifestPath);
  const replay = replayTrajectoryBundle(host, manifestPath);
  const sampleCount = Math.max(1, options.sampleCount ?? 12);
  const records = host.readRecords(bundle.dataPath);
  const sessionBlocks = buildTrajectorySessionBlocks(records, sampleCount);
  const findings = buildTrajectoryCompressionFindings(
    bundle,
    sessionBlocks,
    records.length,
  );
  const stamp = Date.now();
  const label = host.slug(`${bundle.label}-compressed`);
  const compressedPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}.compressed.json`,
  );
  const reportPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-compressed.md`,
  );

  writeFileSync(
    compressedPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        bundle,
        replay,
        sampleCount,
        sessionBlocks,
        findings,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    [
      `# Trajectory Compression: ${bundle.label}`,
      "",
      `- Source manifest: ${bundle.manifestPath}`,
      `- Messages: ${bundle.messageCount}`,
      `- Sessions: ${bundle.sessionCount}`,
      `- Sample count per session: ${sampleCount}`,
      "",
      "## Findings",
      ...findings.map((entry) => `- ${entry}`),
      "",
      "## Session Blocks",
      ...sessionBlocks.flatMap((block) => [
        `### ${block.sessionId} (${block.turns} turns)`,
        ...(block.preview.length
          ? block.preview.map((line) => `- ${line}`)
          : ["- (none)"]),
        "",
      ]),
    ].join("\n"),
    "utf8",
  );

  return {
    bundle,
    replay,
    compressedPath,
    reportPath,
    sampleCount,
    sessionBlocks,
    findings,
  };
}
