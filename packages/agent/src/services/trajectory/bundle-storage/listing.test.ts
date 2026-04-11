import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeTrajectoryBenchmarkManifest,
  describeTrajectoryBundle,
  listTrajectoryBenchmarkManifests,
  listTrajectoryBundles,
  readTrajectoryRecords,
} from "./listing";

describe("trajectory bundle manifest listing", () => {
  it("sorts and reads trajectory and benchmark manifests while preserving records", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-listing-"));

    try {
      const oldManifest = {
        createdAt: "2026-03-20T00:00:00.000Z",
        label: "old",
        purpose: "old",
        mode: "research",
        tags: [],
        notes: "",
        limit: 1,
        filters: { sessionId: null, role: null },
        messageCount: 1,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1 },
        manifestPath: "should-be-replaced",
        dataPath: "data-old",
        summaryPath: "summary-old",
      };
      const newManifest = {
        createdAt: "2026-03-21T00:00:00.000Z",
        label: "new",
        purpose: "new",
        mode: "research",
        tags: [],
        notes: "",
        limit: 2,
        filters: { sessionId: null, role: null },
        messageCount: 2,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1, assistant: 1 },
        manifestPath: "should-be-replaced",
        dataPath: "data-new",
        summaryPath: "summary-new",
      };
      const benchmarkManifest = {
        createdAt: "2026-03-21T00:00:00.000Z",
        label: "bench",
        purpose: "benchmarking",
        tags: ["bench"],
        rubric: [],
        cases: [],
        group: "benchmark",
        environment: {
          provider: "offline",
          model: "offline",
          baseUrl: "n/a",
          temperature: 0,
          maxTokens: 2048,
          bundleCount: 1,
          canEvaluate: true,
          canPackage: true,
        },
      };

      writeFileSync(
        join(root, "trajectory-1-old-manifest.json"),
        JSON.stringify(oldManifest, null, 2),
        "utf8",
      );
      writeFileSync(
        join(root, "trajectory-2-new-manifest.json"),
        JSON.stringify(newManifest, null, 2),
        "utf8",
      );
      writeFileSync(
        join(root, "trajectory-1-bench-benchmark.json"),
        JSON.stringify(benchmarkManifest, null, 2),
        "utf8",
      );

      const bundles = listTrajectoryBundles(root);
      expect(bundles).toHaveLength(2);
      expect(bundles[0]?.label).toBe("new");
      expect(bundles[1]?.label).toBe("old");

      const loadedBundle = describeTrajectoryBundle(
        join(root, "trajectory-1-old-manifest.json"),
      );
      expect(loadedBundle.label).toBe("old");
      expect(loadedBundle.manifestPath).toBe("should-be-replaced");

      const benchmarks = listTrajectoryBenchmarkManifests(root);
      expect(benchmarks).toHaveLength(1);
      expect(benchmarks[0]?.label).toBe("bench");
      expect(benchmarks[0]?.manifestPath).toContain("benchmark.json");

      const describedBenchmark = describeTrajectoryBenchmarkManifest(
        join(root, "trajectory-1-bench-benchmark.json"),
      );
      expect(describedBenchmark.environment.provider).toBe("offline");
      expect(describedBenchmark.cases).toHaveLength(0);

      const recordPayload = [
        {
          sessionId: "session-a",
          createdAt: "2026-03-20T00:00:00.000Z",
          role: "user",
          text: "hello",
        },
        {
          sessionId: "session-a",
          createdAt: "2026-03-20T00:00:01.000Z",
          role: "assistant",
          text: "world",
        },
      ];
      const recordsPath = join(root, "trajectory-records.jsonl");
      writeFileSync(
        recordsPath,
        `${JSON.stringify(recordPayload[0])}\n${JSON.stringify(recordPayload[1])}\n`,
        "utf8",
      );

      const records = readTrajectoryRecords(recordsPath);
      expect(records).toHaveLength(2);
      expect(readFileSync(recordsPath, "utf8")).toContain("hello");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
