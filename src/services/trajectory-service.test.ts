import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrajectoryService } from "./trajectory-service";

describe("TrajectoryService", () => {
  it("exports filtered bundles with manifest, analysis, and evaluation metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-trajectory-"));
    const sessions = {
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
    };
    const service = new TrajectoryService(root, sessions as never);

    try {
      const bundle = service.exportFilteredBundle({
        limit: 10,
        sessionId: "session-a",
        label: "Replay Fixture",
        purpose: "training data",
        mode: "research",
        tags: ["memory", "skills"],
        notes: "Fixture used to validate trajectory exports.",
      });

      const jsonl = readFileSync(bundle.dataPath, "utf8").trim().split("\n");
      const manifest = JSON.parse(
        readFileSync(bundle.manifestPath, "utf8"),
      ) as {
        manifestPath: string;
        messageCount: number;
        sessionCount: number;
        filters: { sessionId: string | null };
        roleCounts: Record<string, number>;
        label: string;
        purpose?: string;
        mode?: string;
        tags?: string[];
        notes?: string;
      };
      const summary = readFileSync(bundle.summaryPath, "utf8");

      expect(jsonl).toHaveLength(2);
      expect(manifest.label).toBe("replay-fixture");
      expect(manifest.purpose).toBe("training data");
      expect(manifest.mode).toBe("research");
      expect(manifest.tags).toEqual(["memory", "skills"]);
      expect(manifest.notes).toContain("validate trajectory exports");
      expect(manifest.messageCount).toBe(2);
      expect(manifest.sessionCount).toBe(1);
      expect(manifest.filters.sessionId).toBe("session-a");
      expect(manifest.roleCounts.user).toBe(1);
      expect(manifest.roleCounts.assistant).toBe(1);
      expect(manifest.manifestPath).toBe(bundle.manifestPath);
      expect(summary).toContain("Trajectory Bundle: replay-fixture");
      expect(summary).toContain("session-a");

      const bundles = service.listBundles();
      expect(bundles).toHaveLength(1);
      expect(bundles[0]?.dataPath).toBe(bundle.dataPath);

      const replay = service.replayBundle(bundle.manifestPath);
      expect(replay.replayCount).toBe(2);
      expect(replay.replayPreview).toHaveLength(2);
      expect(replay.replayPath).toContain("replay");
      expect(readFileSync(replay.replaySummaryPath, "utf8")).toContain(
        "Trajectory Replay: replay-fixture",
      );
      expect(service.describeBundle(bundle.manifestPath).label).toBe(
        "replay-fixture",
      );

      const compressed = service.compressBundle(bundle.manifestPath, {
        sampleCount: 2,
      });
      expect(compressed.sessionBlocks.length).toBeGreaterThan(0);
      expect(compressed.findings[0]).toContain("Compressed");
      expect(readFileSync(compressed.reportPath, "utf8")).toContain(
        "Trajectory Compression: replay-fixture",
      );

      const analysis = service.analyze({
        limit: 10,
        sessionId: "session-a",
        label: "Replay Fixture",
        purpose: "training data",
        mode: "research",
        tags: ["memory", "skills"],
      });
      expect(analysis.focus).toBe("research");
      expect(analysis.prompt).toContain("research analysis");
      expect(analysis.prompt).toContain("session-a");
      expect(
        analysis.highlights.some((line) => line.includes("Messages: 2")),
      ).toBe(true);
      expect(analysis.replay.replayCount).toBe(2);

      const evaluation = await service.evaluateBundle(bundle.manifestPath, {
        rubric: ["user", "assistant", "skills"],
      });
      expect(evaluation.score).toBeGreaterThan(0);
      expect(evaluation.reportPath).toContain("evaluation");
      expect(evaluation.evaluationPath).toContain("evaluation");
      expect(readFileSync(evaluation.reportPath, "utf8")).toContain(
        "Trajectory Evaluation",
      );
      expect(readFileSync(evaluation.responsePath ?? "", "utf8")).toContain(
        "Offline trajectory analysis",
      );

      const packageBundle = await service.package({
        limit: 10,
        sessionId: "session-a",
        label: "Replay Fixture",
        purpose: "training data",
        mode: "research",
        tags: ["memory", "skills"],
        notes: "Fixture used to validate trajectory exports.",
        rubric: ["user", "assistant", "skills"],
      });
      expect(packageBundle.bundle.label).toBe("replay-fixture");
      expect(packageBundle.evaluation.score).toBeGreaterThan(0);
      expect(packageBundle.packageManifestPath).toContain("package");
      expect(readFileSync(packageBundle.reportPath, "utf8")).toContain(
        "Trajectory Research Package",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
