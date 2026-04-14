import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTrajectoryServiceBenchmarkManifest,
  describeTrajectoryServiceBenchmarkEnvironment,
  runTrajectoryServiceBenchmark,
} from "./service-operations/benchmark";
import {
  analyzeTrajectoryService,
  exportTrajectoryServiceRecent,
} from "./service-operations/exports";
import {
  exportTrajectoryServiceRlDataset,
  exportTrajectoryServiceRlReady,
} from "./service-operations/rl";
import { createTrajectoryServiceHosts } from "./service-support";

describe("trajectory service orchestration", () => {
  it("routes export, analysis, rl export, and benchmark orchestration through helpers", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-ops-"));
    const source = {
      baseDir: root,
      sessions: {
        recent(limit: number) {
          return [
            {
              sessionId: "session-a",
              createdAt: "2026-03-20T00:00:00.000Z",
              role: "user" as const,
              text: "First user message",
            },
            {
              sessionId: "session-a",
              createdAt: "2026-03-20T00:00:01.000Z",
              role: "assistant" as const,
              text: "Assistant reply",
            },
            {
              sessionId: "session-b",
              createdAt: "2026-03-20T00:00:02.000Z",
              role: "user" as const,
              text: "Second user message",
            },
          ].slice(0, limit);
        },
        summary() {
          return { totalSessions: 2 };
        },
      },
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
      describeBundle(manifestPath: string) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          manifestPath: string;
          dataPath: string;
          summaryPath: string;
          createdAt: string;
          label: string;
          purpose?: string;
          mode?: "dataset" | "research" | "evaluation" | "rl";
          tags?: string[];
          notes?: string;
          limit: number;
          filters?: {
            sessionId?: string | null;
            role?: "user" | "assistant" | "system" | null;
          };
          messageCount: number;
          sessionCount: number;
          sessions: string[];
          roleCounts: Record<string, number>;
        };
        return {
          ...manifest,
          summaryPath: manifest.summaryPath,
        };
      },
      replayBundle(manifestPath: string) {
        const bundle = source.describeBundle(manifestPath);
        return {
          ...bundle,
          replayPath: join(root, `${bundle.label}.replay.jsonl`),
          replaySummaryPath: join(root, `${bundle.label}.replay.md`),
          replayCount: bundle.messageCount,
          replayPreview: [],
        };
      },
      compareBundles() {
        throw new Error("compareBundles is not expected for this test");
      },
      evaluateBundle(manifestPath: string) {
        const bundle = source.describeBundle(manifestPath);
        const replay = source.replayBundle(manifestPath);
        return Promise.resolve({
          focus: "evaluation" as const,
          bundle,
          replay,
          prompt: "prompt",
          highlights: ["highlight"],
          score: 92,
          grade: "A" as const,
          findings: ["finding"],
          recommendations: ["recommendation"],
          evaluationPath: join(root, `${bundle.label}.evaluation.json`),
          reportPath: join(root, `${bundle.label}.evaluation.md`),
          response: "response",
          responsePath: join(root, `${bundle.label}.response.txt`),
        });
      },
      analyze() {
        throw new Error("analyze is not expected for this test");
      },
      readRecords(dataPath: string) {
        return readFileSync(dataPath, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line: string) => JSON.parse(line));
      },
      listBundles(limit: number) {
        return [].slice(0, limit);
      },
      listBenchmarkManifests() {
        return [];
      },
      describeBenchmarkManifest(manifestPath: string) {
        return JSON.parse(readFileSync(manifestPath, "utf8")) as never;
      },
    };
    const hosts = createTrajectoryServiceHosts(source as never);

    try {
      const exported = exportTrajectoryServiceRecent(hosts, 2);
      expect(exported).toContain("trajectory-");

      const analysis = analyzeTrajectoryService(hosts, {
        limit: 10,
        sessionId: "session-a",
        label: "Replay Fixture",
        purpose: "training data",
        mode: "research",
        tags: ["memory", "skills"],
      });
      expect(analysis.focus).toBe("research");
      expect(analysis.prompt).toContain("research analysis");
      expect(
        analysis.highlights.some((line) => line.includes("Messages")),
      ).toBe(true);

      const ready = exportTrajectoryServiceRlReady(hosts, "session-a", {
        label: "RL Ready",
        model: "gpt-test",
        provider: "offline",
        windowSize: 2,
      });
      expect(ready.turnCount).toBeGreaterThan(0);
      expect(readFileSync(ready.manifestPath, "utf8")).toContain(
        '"label": "rl-ready"',
      );

      const dataset = exportTrajectoryServiceRlDataset(hosts, {
        label: "RL Dataset",
        windowSize: 2,
      });
      expect(dataset.sessionCount).toBeGreaterThan(0);

      const benchmarkEnvironment =
        describeTrajectoryServiceBenchmarkEnvironment(hosts);
      expect(benchmarkEnvironment.canEvaluate).toBe(true);
      expect(benchmarkEnvironment.canPackage).toBe(true);

      const benchmarkManifest = createTrajectoryServiceBenchmarkManifest(
        hosts,
        {
          label: "Replay Benchmark",
          rubric: ["coverage", "signal"],
          cases: [
            { manifestPath: analysis.bundle.manifestPath, label: "baseline" },
          ],
        },
      );
      expect(benchmarkManifest.cases).toHaveLength(1);

      const benchmarkRun = await runTrajectoryServiceBenchmark(
        hosts,
        benchmarkManifest.manifestPath,
      );
      expect(benchmarkRun.cases).toHaveLength(1);
      expect(readFileSync(benchmarkRun.reportPath, "utf8")).toContain(
        "Trajectory Benchmark Run",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
