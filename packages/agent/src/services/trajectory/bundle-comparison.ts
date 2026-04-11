import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
} from "../../types/trajectory";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops-types";
import { replayTrajectoryBundle } from "./bundle-replay";

export function buildTrajectoryRoleDelta(
  left: TrajectoryBundleEntry,
  right: TrajectoryBundleEntry,
): Record<string, number> {
  const roleKeys = Array.from(
    new Set([
      ...Object.keys(left.roleCounts),
      ...Object.keys(right.roleCounts),
    ]),
  );
  return roleKeys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = (right.roleCounts[key] ?? 0) - (left.roleCounts[key] ?? 0);
    return acc;
  }, {});
}

export function buildTrajectoryComparisonFindings(
  messageDelta: number,
  sessionDelta: number,
  roleDelta: Record<string, number>,
): string[] {
  return [
    `Message delta: ${messageDelta >= 0 ? "+" : ""}${messageDelta}`,
    `Session delta: ${sessionDelta >= 0 ? "+" : ""}${sessionDelta}`,
    `Role delta: ${Object.entries(roleDelta)
      .map(([role, count]) => `${role}=${count >= 0 ? "+" : ""}${count}`)
      .join(", ")}`,
  ];
}

export function buildTrajectoryComparisonRecommendation(
  messageDelta: number,
  sessionDelta: number,
): string {
  if (messageDelta > 0 && sessionDelta >= 0) {
    return "Right bundle expands coverage and is a stronger candidate for follow-on evaluation.";
  }
  if (messageDelta < 0) {
    return "Left bundle is broader; inspect whether right-side filtering removed useful supervision.";
  }
  return "Both bundles are similar in breadth; compare qualitative findings and evaluation scores next.";
}

export function compareTrajectoryBundles(
  host: TrajectoryBundleOperationsHost,
  leftManifestPath: string,
  rightManifestPath: string,
): TrajectoryComparisonBundle {
  const left = host.describeBundle(leftManifestPath);
  const right = host.describeBundle(rightManifestPath);
  const leftReplay = replayTrajectoryBundle(host, leftManifestPath);
  const rightReplay = replayTrajectoryBundle(host, rightManifestPath);
  const messageDelta = right.messageCount - left.messageCount;
  const sessionDelta = right.sessionCount - left.sessionCount;
  const roleDelta = buildTrajectoryRoleDelta(left, right);
  const findings = buildTrajectoryComparisonFindings(
    messageDelta,
    sessionDelta,
    roleDelta,
  );
  const recommendation = buildTrajectoryComparisonRecommendation(
    messageDelta,
    sessionDelta,
  );
  const stamp = Date.now();
  const label = host.slug(`${left.label}-vs-${right.label}`);
  const reportPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-compare.json`,
  );
  const summaryPath = join(
    host.baseDir,
    `trajectory-${stamp}-${label}-compare.md`,
  );

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        left,
        right,
        leftReplay,
        rightReplay,
        messageDelta,
        sessionDelta,
        roleDelta,
        findings,
        recommendation,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    summaryPath,
    [
      `# Trajectory Comparison: ${left.label} vs ${right.label}`,
      "",
      `- Left manifest: ${left.manifestPath}`,
      `- Right manifest: ${right.manifestPath}`,
      `- Message delta: ${messageDelta >= 0 ? "+" : ""}${messageDelta}`,
      `- Session delta: ${sessionDelta >= 0 ? "+" : ""}${sessionDelta}`,
      "",
      "## Findings",
      ...findings.map((entry) => `- ${entry}`),
      "",
      "## Recommendation",
      recommendation,
    ].join("\n"),
    "utf8",
  );

  return {
    left,
    right,
    leftReplay,
    rightReplay,
    reportPath,
    summaryPath,
    messageDelta,
    sessionDelta,
    roleDelta,
    findings,
    recommendation,
  };
}
