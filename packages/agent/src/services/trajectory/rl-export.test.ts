import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeTrajectoryRlExport,
  exportTrajectoryRlDataset,
  exportTrajectoryRlReady,
} from "./rl-export";

describe("trajectory-service RL export helpers", () => {
  it("exports a single-session RL-ready bundle with metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-rl-"));

    try {
      const result = exportTrajectoryRlReady({
        baseDir: root,
        sessionId: "session-a",
        messages: [
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
            text: "hi there",
          },
          {
            sessionId: "session-a",
            createdAt: "2026-03-20T00:00:02.000Z",
            role: "user",
            text: "tell me more",
          },
          {
            sessionId: "session-a",
            createdAt: "2026-03-20T00:00:03.000Z",
            role: "assistant",
            text: "absolutely",
          },
        ],
        slug: (value) => value.toLowerCase().replaceAll(/\s+/g, "-"),
        options: {
          label: "Session A RL",
          model: "gpt-test",
          provider: "openai",
          agentName: "Dr. Mochibi",
          windowSize: 3,
          includeMetadata: true,
        },
      });

      const manifest = JSON.parse(
        readFileSync(result.manifestPath, "utf8"),
      ) as {
        schema: string;
        label: string;
        turnCount: number;
        messageCount: number;
      };
      const lines = readFileSync(result.dataPath, "utf8").trim().split("\n");
      const firstTurn = JSON.parse(lines[0] ?? "{}") as {
        id: string;
        metadata?: { turnIndex: number; sessionMessageCount: number };
      };

      expect(result.turnCount).toBe(2);
      expect(manifest.schema).toBe("doolittle-rl-v1");
      expect(manifest.label).toBe("session-a-rl");
      expect(manifest.turnCount).toBe(2);
      expect(manifest.messageCount).toBe(4);
      expect(firstTurn.id).toBe("session-a:1");
      expect(firstTurn.metadata?.turnIndex).toBe(1);
      expect(firstTurn.metadata?.sessionMessageCount).toBe(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports a multi-session RL dataset and describes the capability surface", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-rl-"));

    try {
      const result = exportTrajectoryRlDataset({
        baseDir: root,
        messages: [
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
          {
            sessionId: "session-b",
            createdAt: "2026-03-20T00:00:03.000Z",
            role: "assistant",
            text: "four",
          },
        ],
        slug: (value) => value.toLowerCase().replaceAll(/\s+/g, "-"),
        options: {
          label: "Training Set",
          model: "gpt-test",
          provider: "openai",
          agentName: "Dr. Mochibi",
          windowSize: 2,
        },
      });

      const manifest = JSON.parse(
        readFileSync(result.manifestPath, "utf8"),
      ) as {
        schema: string;
        label: string;
        sessionCount: number;
        turnCount: number;
      };
      const lines = readFileSync(result.dataPath, "utf8").trim().split("\n");
      const description = describeTrajectoryRlExport(7);

      expect(result.turnCount).toBe(2);
      expect(result.sessionCount).toBe(2);
      expect(lines).toHaveLength(2);
      expect(manifest.schema).toBe("doolittle-rl-v1");
      expect(manifest.label).toBe("training-set");
      expect(manifest.sessionCount).toBe(2);
      expect(manifest.turnCount).toBe(2);
      expect(description).toContain("Sessions available: 7");
      expect(description).toContain("exportRlDataset()");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
