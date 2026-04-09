import { describe, expect, it } from "bun:test";
import type {
  TrajectoryAnalysisBundle,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import {
  buildTrajectoryEvaluationReport,
  buildTrajectoryEvaluationSnapshot,
  buildTrajectoryResearchPackageManifest,
  buildTrajectoryResearchPackageReport,
} from "./evaluation-reporting";

const replayFixture: TrajectoryReplayResult = {
  manifestPath: "/tmp/trajectory-fixture-manifest.json",
  dataPath: "/tmp/trajectory-fixture.jsonl",
  summaryPath: "/tmp/trajectory-fixture-summary.md",
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
  replayPath: "/tmp/trajectory-fixture-replay.jsonl",
  replaySummaryPath: "/tmp/trajectory-fixture-replay.md",
  replayCount: 3,
  replayPreview: [
    {
      sessionId: "session-a",
      createdAt: "2026-03-30T00:00:00.000Z",
      role: "user",
      text: "The user asks for help with memory-aware skills.",
    },
  ],
};

const analysisFixture: TrajectoryAnalysisBundle = {
  focus: "research",
  bundle: replayFixture,
  replay: replayFixture,
  prompt: "Evaluate the trajectory for research quality and coverage.",
  highlights: ["Messages: 3", "Roles: user=2, assistant=1"],
  purpose: "trajectory research package",
  mode: "research",
  tags: ["memory", "skills"],
};

const evaluationFixture: TrajectoryEvaluationBundle = {
  focus: "research",
  bundle: replayFixture,
  replay: replayFixture,
  prompt: analysisFixture.prompt,
  highlights: analysisFixture.highlights,
  purpose: "trajectory research package",
  mode: "research",
  tags: ["memory", "skills"],
  score: 84,
  grade: "B",
  findings: ["Multiple sessions captured useful variety."],
  recommendations: ["Add more assistant follow-up turns."],
  evaluationPath: "/tmp/trajectory-fixture.evaluation.json",
  reportPath: "/tmp/trajectory-fixture-evaluation.md",
  response: "Offline trajectory analysis completed.",
  responsePath: "/tmp/trajectory-fixture-evaluation-response.md",
};

describe("trajectory-service evaluation reporting", () => {
  it("builds evaluation snapshots with explicit persisted tags", () => {
    const snapshot = buildTrajectoryEvaluationSnapshot({
      createdAt: "2026-03-31T00:00:00.000Z",
      bundle: replayFixture,
      replay: replayFixture,
      score: 84,
      grade: "B",
      findings: evaluationFixture.findings,
      recommendations: evaluationFixture.recommendations,
      rubric: ["coverage", "signal"],
      tags: ["explicit-only"],
      response: "Offline trajectory analysis completed.",
    });

    expect(snapshot.bundle.label).toBe("trajectory-fixture");
    expect(snapshot.tags).toEqual(["explicit-only"]);
    expect(snapshot.rubric).toEqual(["coverage", "signal"]);
    expect(snapshot.recommendations[0]).toContain("follow-up");
  });

  it("formats evaluation reports with scorecards and empty fallbacks", () => {
    const report = buildTrajectoryEvaluationReport({
      bundle: replayFixture,
      focus: "evaluation",
      purpose: "trajectory evaluation",
      tags: ["memory", "skills"],
      rubric: ["coverage"],
      highlights: ["Messages: 3"],
      score: 73,
      grade: "C",
      findings: [],
      recommendations: [],
      prompt: "Review the replay and score the bundle.",
      response: "Offline trajectory analysis completed.",
    });

    expect(report).toContain("# Trajectory Evaluation: trajectory-fixture");
    expect(report).toContain("- Score: 73/100");
    expect(report).toContain("- Tags: memory, skills");
    expect(report).toContain("- Rubric: coverage");
    expect(report).toContain("## Findings");
    expect(report).toContain("- none");
    expect(report).toContain("## Recommendations");
    expect(report).toContain("Offline trajectory analysis completed.");
  });

  it("formats research package manifests and reports from analysis and evaluation", () => {
    const manifest = buildTrajectoryResearchPackageManifest({
      createdAt: "2026-03-31T00:00:00.000Z",
      analysis: analysisFixture,
      evaluation: evaluationFixture,
      response: evaluationFixture.response ?? evaluationFixture.reportPath,
    });
    const report = buildTrajectoryResearchPackageReport({
      analysis: analysisFixture,
      evaluation: evaluationFixture,
      purpose: "trajectory research package",
      mode: "research",
    });

    expect(manifest.analysis.prompt).toContain("research quality");
    expect(manifest.evaluation.score).toBe(84);
    expect(manifest.evaluation.responsePath).toBe(
      "/tmp/trajectory-fixture-evaluation-response.md",
    );
    expect(report).toContain(
      "# Trajectory Research Package: trajectory-fixture",
    );
    expect(report).toContain("- Mode: research");
    expect(report).toContain(
      "- Findings: Multiple sessions captured useful variety.",
    );
    expect(report).toContain("- Report: /tmp/trajectory-fixture-evaluation.md");
  });
});
