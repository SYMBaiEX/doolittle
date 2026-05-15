import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeTrajectoryServiceRlExport,
  exportTrajectoryServiceRlDataset,
  exportTrajectoryServiceRlReady,
  type TrajectoryServiceRlExportHost,
} from "./rl-export-orchestration";

describe("trajectory-service RL export orchestration", () => {
  it("reads a fixed window for single-session exports", () => {
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-rl-host-"),
    );
    let readLimit = 0;

    const host: TrajectoryServiceRlExportHost = {
      baseDir,
      sessions: {
        recent(limit: number) {
          readLimit = limit;
          return [
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
              text: "hi",
            },
          ];
        },
        summary() {
          return { totalSessions: 1 };
        },
      },
      slug(value) {
        return value.toLowerCase().replaceAll(" ", "-");
      },
    };

    try {
      const result = exportTrajectoryServiceRlReady(host, "session-a", {
        limit: 10,
        model: "gpt-test",
      });

      expect(readLimit).toBe(500);
      expect(result.turnCount).toBe(1);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("uses default and custom limits for dataset exports", () => {
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-rl-host-"),
    );
    const calls: number[] = [];

    const host: TrajectoryServiceRlExportHost = {
      baseDir,
      sessions: {
        recent(limit: number) {
          calls.push(limit);
          return [
            {
              sessionId: "session-a",
              createdAt: "2026-03-20T00:00:00.000Z",
              role: "user",
              text: "one",
            },
            {
              sessionId: "session-a",
              createdAt: "2026-03-20T00:00:01.000Z",
              role: "assistant",
              text: "two",
            },
            {
              sessionId: "session-b",
              createdAt: "2026-03-20T00:00:02.000Z",
              role: "user",
              text: "three",
            },
          ];
        },
        summary() {
          return { totalSessions: 2 };
        },
      },
      slug(value) {
        return value.toLowerCase().replaceAll(" ", "-");
      },
    };

    try {
      exportTrajectoryServiceRlDataset(host, {});
      exportTrajectoryServiceRlDataset(host, { limit: 3 });

      expect(calls).toEqual([1000, 3]);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("describes RL export using the session summary fallback", () => {
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-rl-host-"),
    );
    const host: TrajectoryServiceRlExportHost = {
      baseDir,
      sessions: {
        recent() {
          return [];
        },
        summary(limit) {
          expect(limit).toBe(50);
          return { totalSessions: 7 };
        },
      },
      slug(value) {
        return value;
      },
    };

    try {
      const description = describeTrajectoryServiceRlExport(host);

      expect(description).toContain("Sessions available: 7");
      expect(description).toContain("not ElizaOS SDK trajectory data");
      expect(description).toContain("exportRlDataset()");
      expect(description).toContain("exportRlReady(sessionId)");
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
