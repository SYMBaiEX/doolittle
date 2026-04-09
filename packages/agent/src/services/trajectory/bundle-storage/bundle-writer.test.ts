import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrajectoryRecord } from "../../../types/trajectory";
import {
  exportTrajectoryBundleRecords,
  exportTrajectoryDataset,
} from "./dataset";
import type { TrajectoryBundleStorageHost } from "./types";

function createHost(
  records: TrajectoryRecord[],
  baseDir: string,
): TrajectoryBundleStorageHost {
  return {
    baseDir,
    sessions: {
      recent(limit: number) {
        return records.slice(0, limit);
      },
    },
    slug(value: string) {
      return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
    },
  };
}

describe("trajectory bundle writer seam", () => {
  it("exports dataset and bundle artifacts with expected metadata", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-bundle-writer-"),
    );
    const records: TrajectoryRecord[] = [
      {
        sessionId: "session-a",
        createdAt: "2026-03-20T00:00:00.000Z",
        role: "user",
        text: "first",
      },
      {
        sessionId: "session-b",
        createdAt: "2026-03-20T00:00:01.000Z",
        role: "assistant",
        text: "second",
      },
      {
        sessionId: "session-b",
        createdAt: "2026-03-20T00:00:02.000Z",
        role: "assistant",
        text: "third",
      },
    ];
    const host = createHost(records, root);

    try {
      const dataPath = exportTrajectoryDataset(host, {
        label: "dataset label",
        limit: 3,
        tags: ["alpha", "beta"],
      });
      const dataText = readFileSync(dataPath, "utf8");
      const dataLines = dataText.split("\n").filter(Boolean);
      expect(dataLines).toHaveLength(3);
      expect(dataText).toContain("first");

      const bundle = exportTrajectoryBundleRecords(host, {
        sessionId: "session-b",
        label: "session-b bundle",
        purpose: "unit test",
        mode: "research",
        tags: ["session-test"],
      });
      expect(bundle.messageCount).toBe(2);
      expect(bundle.sessionCount).toBe(1);

      const summary = readFileSync(bundle.summaryPath, "utf8");
      expect(summary).toContain("# Trajectory Bundle: session-b-bundle");
      expect(summary).toContain("- Messages: 2");
      expect(summary).toContain("## Role Counts");
      expect(summary).toContain("- assistant: 2");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
