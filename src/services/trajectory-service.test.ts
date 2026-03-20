import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrajectoryService } from "./trajectory-service";

describe("TrajectoryService", () => {
  it("exports filtered bundles with manifest and summary metadata", () => {
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
      });

      const jsonl = readFileSync(bundle.dataPath, "utf8").trim().split("\n");
      const manifest = JSON.parse(readFileSync(bundle.manifestPath, "utf8")) as {
        messageCount: number;
        sessionCount: number;
        filters: { sessionId: string | null };
        roleCounts: Record<string, number>;
        label: string;
      };
      const summary = readFileSync(bundle.summaryPath, "utf8");

      expect(jsonl).toHaveLength(2);
      expect(manifest.label).toBe("replay-fixture");
      expect(manifest.messageCount).toBe(2);
      expect(manifest.sessionCount).toBe(1);
      expect(manifest.filters.sessionId).toBe("session-a");
      expect(manifest.roleCounts.user).toBe(1);
      expect(manifest.roleCounts.assistant).toBe(1);
      expect(summary).toContain("Trajectory Bundle: replay-fixture");
      expect(summary).toContain("session-a");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
