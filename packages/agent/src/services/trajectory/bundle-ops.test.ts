import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrajectoryBundleEntry } from "../../types/trajectory";
import {
  buildTrajectoryComparisonRecommendation,
  buildTrajectoryRoleDelta,
  buildTrajectorySessionBlocks,
  compareTrajectoryBundles,
  compressTrajectoryBundle,
  replayTrajectoryBundle,
  type TrajectoryBundleOperationsHost,
} from "./bundle-ops";

function createHost(baseDir: string): TrajectoryBundleOperationsHost {
  const bundles = new Map<string, TrajectoryBundleEntry>([
    [
      "left-manifest",
      {
        manifestPath: "left-manifest",
        dataPath: "left-data",
        summaryPath: "left-summary",
        createdAt: "2026-03-20T00:00:00.000Z",
        label: "baseline",
        purpose: "training",
        mode: "research" as const,
        tags: ["alpha"],
        notes: "left",
        limit: 10,
        filters: { sessionId: null, role: null },
        messageCount: 2,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1, assistant: 1 },
      },
    ],
    [
      "right-manifest",
      {
        manifestPath: "right-manifest",
        dataPath: "right-data",
        summaryPath: "right-summary",
        createdAt: "2026-03-21T00:00:00.000Z",
        label: "candidate",
        purpose: "training",
        mode: "research" as const,
        tags: ["beta"],
        notes: "right",
        limit: 10,
        filters: { sessionId: null, role: null },
        messageCount: 4,
        sessionCount: 2,
        sessions: ["session-a", "session-b"],
        roleCounts: { user: 2, assistant: 1, system: 1 },
      },
    ],
  ]);
  const records = new Map([
    [
      "left-data",
      [
        {
          sessionId: "session-a",
          createdAt: "2026-03-20T00:00:00.000Z",
          role: "user" as const,
          text: "hello",
        },
        {
          sessionId: "session-a",
          createdAt: "2026-03-20T00:00:01.000Z",
          role: "assistant" as const,
          text: "hi there",
        },
      ],
    ],
    [
      "right-data",
      [
        {
          sessionId: "session-b",
          createdAt: "2026-03-21T00:00:00.000Z",
          role: "user" as const,
          text: "candidate one",
        },
        {
          sessionId: "session-b",
          createdAt: "2026-03-21T00:00:01.000Z",
          role: "assistant" as const,
          text: "candidate two",
        },
        {
          sessionId: "session-c",
          createdAt: "2026-03-21T00:00:02.000Z",
          role: "user" as const,
          text: "candidate three",
        },
        {
          sessionId: "session-c",
          createdAt: "2026-03-21T00:00:03.000Z",
          role: "system" as const,
          text: "candidate four",
        },
      ],
    ],
  ]);

  return {
    baseDir,
    slug(value: string) {
      return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    },
    describeBundle(manifestPath: string) {
      const bundle = bundles.get(manifestPath);
      if (!bundle) {
        throw new Error(`Missing bundle for ${manifestPath}`);
      }
      return bundle;
    },
    readRecords(dataPath: string) {
      return records.get(dataPath) ?? [];
    },
    listBundles(limit: number) {
      return Array.from(bundles.values()).slice(0, limit);
    },
  };
}

describe("trajectory-service-bundle-ops", () => {
  it("replays and compresses trajectory bundles with stable summaries", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-bundle-ops-"),
    );
    const host = createHost(root);

    try {
      const replay = replayTrajectoryBundle(host, "left-manifest");
      expect(replay.replayCount).toBe(2);
      expect(replay.replayPreview).toHaveLength(2);
      expect(readFileSync(replay.replaySummaryPath, "utf8")).toContain(
        "Trajectory Replay: baseline",
      );

      const compressed = compressTrajectoryBundle(host, "right-manifest", {
        sampleCount: 1,
      });
      expect(compressed.sampleCount).toBe(1);
      expect(compressed.sessionBlocks[0]?.turns).toBe(2);
      expect(compressed.findings[0]).toContain("Compressed 4 messages");
      expect(readFileSync(compressed.reportPath, "utf8")).toContain(
        "Trajectory Compression: candidate",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("compares trajectory bundles and exposes reusable delta helpers", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-bundle-compare-"),
    );
    const host = createHost(root);

    try {
      const comparison = compareTrajectoryBundles(
        host,
        "left-manifest",
        "right-manifest",
      );
      expect(comparison.messageDelta).toBe(2);
      expect(comparison.sessionDelta).toBe(1);
      expect(comparison.roleDelta).toEqual({
        user: 1,
        assistant: 0,
        system: 1,
      });
      expect(comparison.recommendation).toContain("stronger candidate");
      expect(readFileSync(comparison.summaryPath, "utf8")).toContain(
        "Trajectory Comparison: baseline vs candidate",
      );

      expect(
        buildTrajectoryRoleDelta(comparison.left, comparison.right),
      ).toEqual(comparison.roleDelta);
      expect(
        buildTrajectoryComparisonRecommendation(
          comparison.messageDelta,
          comparison.sessionDelta,
        ),
      ).toBe(comparison.recommendation);
      expect(
        buildTrajectorySessionBlocks(host.readRecords("right-data"), 1),
      ).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
