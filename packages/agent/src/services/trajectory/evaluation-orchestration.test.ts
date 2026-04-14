import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  TrajectoryBundleEntry,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import type { TrajectoryEvaluationHost } from "./evaluation";
import {
  evaluate,
  evaluateBundle,
  packageBundle,
  packageLatest,
} from "./evaluation";

function createHost(baseDir: string): TrajectoryEvaluationHost {
  const bundle: TrajectoryBundleEntry = {
    manifestPath: join(baseDir, "bundle.json"),
    dataPath: join(baseDir, "bundle.jsonl"),
    summaryPath: join(baseDir, "bundle.md"),
    createdAt: "2026-03-30T00:00:00.000Z",
    label: "trajectory-fixture",
    purpose: "trajectory evaluation",
    mode: "research",
    tags: ["memory", "skills"],
    notes: "fixture",
    limit: 3,
    filters: {
      sessionId: "session-a",
      role: null,
    },
    messageCount: 3,
    sessionCount: 2,
    sessions: ["session-a", "session-b"],
    roleCounts: {
      user: 2,
      assistant: 1,
    },
  };
  const replay: TrajectoryReplayResult = {
    ...bundle,
    replayPath: join(baseDir, "trajectory-fixture.replay.jsonl"),
    replaySummaryPath: join(baseDir, "trajectory-fixture.replay.md"),
    replayCount: 3,
    replayPreview: [
      {
        sessionId: "session-a",
        createdAt: "2026-03-30T00:00:00.000Z",
        role: "user",
        text: "The user asks for help with memory-aware skills.",
      },
      {
        sessionId: "session-a",
        createdAt: "2026-03-30T00:00:01.000Z",
        role: "assistant",
        text: "The assistant suggests a research skill and memory strategy.",
      },
      {
        sessionId: "session-b",
        createdAt: "2026-03-30T00:00:02.000Z",
        role: "user",
        text: "The user asks for training coverage recommendations.",
      },
    ],
  };

  return {
    baseDir,
    slug(value: string) {
      return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    },
    describeBundle() {
      return bundle;
    },
    replayBundle() {
      return replay;
    },
    listBundles(limit = 1) {
      return limit > 0 ? [bundle] : [];
    },
    analyze(options = {}) {
      return {
        focus: "research",
        bundle,
        replay,
        prompt: `analysis prompt for ${options.purpose ?? "trajectory evaluation"}`,
        highlights: ["Messages: 3", "Sessions: 2"],
        purpose: options.purpose,
        mode: "research",
        tags: options.tags ?? bundle.tags,
      };
    },
  };
}

describe("trajectory evaluation orchestration", () => {
  it("evaluates a bundle and writes artifacts through the thin public entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-eval-"));
    const host = createHost(root);

    try {
      const evaluation = await evaluateBundle(host, "bundle.json", {
        rubric: ["memory", "skills"],
      });

      expect(evaluation.focus).toBe("research");
      expect(evaluation.highlights).toContain("Messages: 3");
      expect(evaluation.response).toContain("Offline trajectory analysis");
      expect(readFileSync(evaluation.reportPath, "utf8")).toContain(
        "Trajectory Evaluation",
      );
      expect(readFileSync(evaluation.responsePath ?? "", "utf8")).toContain(
        "Offline trajectory analysis",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes evaluate and package helpers through analysis-owned inputs", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-package-"));
    const host = createHost(root);

    try {
      const evaluation = await evaluate(host, {
        purpose: "research pass",
        tags: ["memory", "coverage"],
      });
      const packaged = await packageBundle(host, {
        purpose: "research package",
        tags: ["memory", "coverage"],
      });

      expect(evaluation.prompt).toContain("research pass");
      expect(packaged.analysis.prompt).toContain("research package");
      expect(packaged.evaluation.tags).toEqual(["memory", "coverage"]);
      expect(readFileSync(packaged.reportPath, "utf8")).toContain(
        "Trajectory Research Package",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("packages the latest bundle when one is available", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-latest-"));
    const host = createHost(root);

    try {
      const packaged = await packageLatest(host);

      expect(packaged).toBeDefined();
      expect(packaged?.bundle.label).toBe("trajectory-fixture");
      expect(packaged?.evaluation.focus).toBe("research");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
