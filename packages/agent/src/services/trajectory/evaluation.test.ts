import { describe, expect, it } from "bun:test";
import type { TrajectoryReplayResult } from "../../types/trajectory";
import {
  buildAnalysisPrompt,
  buildHighlights,
  normalizeEvaluationMode,
  scoreReplay,
} from "./evaluation";

const replayFixture: TrajectoryReplayResult = {
  manifestPath: "/tmp/trajectory-manifest.json",
  dataPath: "/tmp/trajectory.jsonl",
  summaryPath: "/tmp/trajectory-summary.md",
  replayPath: "/tmp/trajectory-replay.jsonl",
  replaySummaryPath: "/tmp/trajectory-replay.md",
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

describe("trajectory-service evaluation helpers", () => {
  it("builds prompts and highlights from replay state", () => {
    const prompt = buildAnalysisPrompt(replayFixture, {
      purpose: "research pass",
      mode: "evaluation",
    });
    const highlights = buildHighlights(replayFixture);

    expect(prompt).toContain("Doolittle");
    expect(prompt).toContain("trajectory-fixture");
    expect(prompt).toContain("trajectory evaluation");
    expect(prompt).toContain("session-a");
    expect(highlights).toContain("Messages: 3");
    expect(highlights.some((line) => line.includes("user=2"))).toBe(true);
  });

  it("normalizes evaluation modes and scores replay coverage", () => {
    const heuristics = scoreReplay(replayFixture, [
      "memory",
      "skills",
      "coverage",
    ]);

    expect(normalizeEvaluationMode("dataset")).toBe("evaluation");
    expect(normalizeEvaluationMode("research")).toBe("research");
    expect(normalizeEvaluationMode("rl")).toBe("rl");
    expect(heuristics.score).toBeGreaterThan(0);
    expect(["A", "B", "C", "D", "F"]).toContain(heuristics.grade);
    expect(
      heuristics.findings.some((entry) => entry.includes("Multiple sessions")),
    ).toBe(true);
    expect(
      heuristics.findings.some((entry) => entry.includes("Rubric coverage")),
    ).toBe(true);
  });
});
