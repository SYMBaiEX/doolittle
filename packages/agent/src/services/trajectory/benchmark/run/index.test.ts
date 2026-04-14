import { describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkCase,
  TrajectoryBenchmarkManifest,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "../../../../types/trajectory";
import type {
  TrajectoryBenchmarkEvaluationOptions,
  TrajectoryBenchmarkHost,
} from "../types";
import { runTrajectoryBenchmark } from "./index";

function createBundleEntry(label: string): TrajectoryBundleEntry {
  return {
    manifestPath: `${label}.json`,
    dataPath: `${label}.jsonl`,
    summaryPath: `${label}.md`,
    createdAt: "2026-04-10T00:00:00.000Z",
    label,
    purpose: "trajectory",
    mode: "evaluation",
    tags: [],
    limit: 2,
    messageCount: 2,
    sessionCount: 1,
    sessions: ["session-a"],
    roleCounts: { user: 1, assistant: 1, system: 0 },
  };
}

function createReplay(entry: TrajectoryBundleEntry): TrajectoryReplayResult {
  return {
    ...entry,
    replayPath: `${entry.label}.replay.jsonl`,
    replaySummaryPath: `${entry.label}.replay.md`,
    replayCount: entry.messageCount,
    replayPreview: [
      {
        sessionId: "session-a",
        createdAt: "2026-04-10T00:00:00.000Z",
        role: "user",
        text: "first",
      },
    ],
  };
}

function createEvaluation(
  entry: TrajectoryBundleEntry,
  score: number,
  recommendations: string[],
): TrajectoryEvaluationBundle {
  return {
    focus: "evaluation",
    bundle: entry,
    replay: createReplay(entry),
    prompt: "prompt",
    highlights: ["highlight"],
    score,
    grade: score >= 90 ? "A" : "B",
    findings: ["finding"],
    recommendations,
    evaluationPath: join("artifacts", `${entry.label}.evaluation.json`),
    reportPath: join("artifacts", `${entry.label}.evaluation.md`),
    purpose: "benchmark",
    mode: "evaluation",
    tags: [],
  };
}

describe("trajectory benchmark run", () => {
  it("runs cases, summarizes results, and writes artifacts", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "trajectory-benchmark-run-"));
    const entries = new Map<string, TrajectoryBundleEntry>([
      ["compare.json", createBundleEntry("compare")],
      ["candidate.json", createBundleEntry("candidate")],
    ]);
    const manifest: TrajectoryBenchmarkManifest = {
      manifestPath: join(baseDir, "benchmark-manifest.json"),
      summaryPath: join(baseDir, "benchmark-summary.md"),
      createdAt: "2026-04-10T00:00:00.000Z",
      label: "run-suite",
      purpose: "benchmark",
      tags: ["default-tag"],
      rubric: ["default-rubric"],
      cases: [
        {
          manifestPath: "compare.json",
          label: "Compare case",
          mode: "evaluation",
        },
        {
          manifestPath: "candidate.json",
          label: "Candidate case",
          tags: ["candidate-tag"],
        } satisfies TrajectoryBenchmarkCase,
      ],
      group: "trajectory-benchmark:run-suite",
      environment: {
        provider: "offline",
        model: "offline",
        baseUrl: "",
        temperature: 0,
        maxTokens: 1024,
        bundleCount: 2,
        canEvaluate: true,
        canPackage: true,
      },
    };
    const manifestPath = join(baseDir, "benchmark-manifest.json");
    const host: TrajectoryBenchmarkHost = {
      baseDir,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
      describeBundle(manifestPathValue: string) {
        const entry = entries.get(manifestPathValue);
        if (!entry) {
          throw new Error(`Missing bundle for ${manifestPathValue}`);
        }
        return entry;
      },
      listBundles() {
        return [];
      },
      replayBundle(manifestPathValue: string) {
        const entry = entries.get(manifestPathValue);
        if (!entry) {
          throw new Error(`Missing bundle for ${manifestPathValue}`);
        }
        return createReplay(entry);
      },
      compareBundles(leftManifestPath: string, rightManifestPath: string) {
        const left = entries.get(leftManifestPath);
        const right = entries.get(rightManifestPath);
        if (!left || !right) {
          throw new Error("Missing comparison bundle");
        }
        return {
          left,
          right,
          leftReplay: createReplay(left),
          rightReplay: createReplay(right),
          reportPath: join(baseDir, "compare-report.md"),
          summaryPath: join(baseDir, "compare-summary.md"),
          messageDelta: right.messageCount - left.messageCount,
          sessionDelta: right.sessionCount - left.sessionCount,
          roleDelta: { user: 0, assistant: 0, system: 0 },
          findings: ["comparison finding"],
          recommendation: "use candidate",
        } as TrajectoryComparisonBundle;
      },
      async evaluateBundle(
        manifestPathValue: string,
        options?: TrajectoryBenchmarkEvaluationOptions,
      ): Promise<TrajectoryEvaluationBundle> {
        if (manifestPathValue === "compare.json") {
          expect(options?.rubric).toEqual(["default-rubric"]);
          expect(options?.tags).toEqual(["default-tag"]);
          expect(options?.mode).toBe("evaluation");
          expect(options?.purpose).toBe("benchmark");
          expect(options?.replay).toBeDefined();
          const entry = entries.get(manifestPathValue);
          if (!entry) {
            throw new Error(`Missing manifest for ${manifestPathValue}`);
          }
          return createEvaluation(entry, 88, [
            "shared-recommendation",
            "compare-recommendation",
          ]);
        }
        if (manifestPathValue === "candidate.json") {
          expect(options?.rubric).toEqual(["default-rubric"]);
          expect(options?.tags).toEqual(["candidate-tag"]);
          expect(options?.mode).toBe("evaluation");
          expect(options?.purpose).toBe("benchmark");
          expect(options?.replay).toBeDefined();
          const entry = entries.get(manifestPathValue);
          if (!entry) {
            throw new Error(`Missing manifest for ${manifestPathValue}`);
          }
          return createEvaluation(entry, 92, [
            "shared-recommendation",
            "candidate-recommendation",
          ]);
        }
        throw new Error(`Unexpected manifest ${manifestPathValue}`);
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    try {
      const result = await runTrajectoryBenchmark(host, manifestPath);

      expect(result.manifestPath.endsWith("benchmark-run.json")).toBe(true);
      expect(result.label).toBe("run-suite");
      expect(result.group).toBe("trajectory-benchmark:run-suite");
      expect(result.purpose).toBe("benchmark");
      expect(result.averageScore).toBe(90);
      expect(result.bestScore).toBe(92);
      expect(result.worstScore).toBe(88);
      expect(result.grade).toBe("A");
      expect(result.cases).toHaveLength(2);
      expect(result.cases[1]?.comparison).toBeDefined();
      expect(result.recommendations).toEqual([
        "shared-recommendation",
        "compare-recommendation",
        "candidate-recommendation",
      ]);
      expect(result.findings).toContain("- finding");
      expect(result.findings).toContain("Average score: 90/100.");

      const reportText = readFileSync(result.reportPath, "utf8");
      expect(reportText).toContain("# Trajectory Benchmark Run: run-suite");
      expect(reportText).toContain("- Average score: 90/100");
      expect(reportText).toContain("- Comparison: use candidate");

      const summaryText = readFileSync(result.summaryPath, "utf8");
      expect(summaryText).toContain(
        "# Trajectory Benchmark Summary: run-suite",
      );
      expect(summaryText).toContain("- Cases: 2");

      const runManifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
      expect(runManifest.averageScore).toBe(90);
      expect(runManifest.grade).toBe("A");
      expect(runManifest.findings).toEqual(result.findings);
      expect(runManifest.recommendations).toEqual(result.recommendations);
      expect(runManifest.environment.provider).toBe("offline");

      const generatedFiles = readdirSync(baseDir).filter(
        (value) => value.startsWith("trajectory-") && value.endsWith(".md"),
      );
      expect(generatedFiles.length).toBe(2);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
