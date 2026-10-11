import {
  fchmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODING_EVAL_SUITES } from "./cases";
import type { CodingRunEvaluation } from "./evaluator";
import {
  CODING_EVAL_PACKAGE_VERSION,
  compareCodingEvalReports,
  createCodingEvalReport,
  listCodingEvalReportFiles,
  parseCodingEvalReport,
  readCodingEvalReport,
  writeCodingEvalReport,
} from "./report";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, fchmodSync: vi.fn(actual.fchmodSync) };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

const temporaryDirectories: string[] = [];
const suite = CODING_EVAL_SUITES["coding-harness-v1"];
const task = suite.tasks[0];
if (!task)
  throw new Error("Expected the coding suite to include its baseline task.");

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-evals-"));
  temporaryDirectories.push(directory);
  return directory;
}

function evaluation(
  runId: string,
  status: CodingRunEvaluation["status"],
  score: number,
): CodingRunEvaluation {
  return {
    runId,
    caseId: task.caseId,
    status,
    score,
    maxScore: 110,
    checks: [
      {
        id: "build",
        status: status === "pass" ? "pass" : "fail",
        weight: 30,
        evidence: [
          "Built under /Users/symbiex/private-project with token=secret",
        ],
      },
    ],
  };
}

function createReport(options: {
  runId: string;
  status: CodingRunEvaluation["status"];
  score: number;
  routeLabel: string;
  fixtureId?: string;
}) {
  return createCodingEvalReport({
    workspace: "/Users/symbiex/dev/austin/eval-fixture",
    suite,
    taskSetId: "coding-harness-v1",
    fixtureId: options.fixtureId ?? "starter-revision:abc123",
    routeLabel: options.routeLabel,
    createdAt: "2026-09-25T12:00:00.000Z",
    runs: [
      {
        taskId: task.id,
        evaluation: evaluation(options.runId, options.status, options.score),
        run: {
          runId: options.runId,
          status: options.status === "incomplete" ? "running" : "complete",
          startedAt: "2026-09-25T12:00:00.000Z",
          endedAt: "2026-09-25T12:00:10.000Z",
          firstActionAt: "2026-09-25T12:00:02.000Z",
          observedActionCount: 6,
        },
      },
    ],
  });
}

afterEach(() => {
  vi.mocked(fchmodSync).mockReset().mockImplementation(actualFs.fchmodSync);
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("coding evaluation reports", () => {
  it("stores comparable results without raw evidence or absolute workspace paths", () => {
    const report = createReport({
      runId: "baseline-run",
      status: "pass",
      score: 110,
      routeLabel: "codex-current",
    });
    const serialized = JSON.stringify(report);

    expect(report.comparisonReady).toBe(true);
    expect(report.suite).toEqual({ id: suite.id, version: suite.version });
    expect(serialized).toContain("evidenceSha256");
    expect(serialized).not.toContain("private-project");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("Built under");
    expect(serialized).not.toContain(task.prompt);
  });

  it("compares only the same frozen tasks and fixture, keeping effort separate", () => {
    const baseline = createReport({
      runId: "baseline-run",
      status: "fail",
      score: 80,
      routeLabel: "route-old",
    });
    const candidate = createReport({
      runId: "candidate-run",
      status: "pass",
      score: 110,
      routeLabel: "route-new",
    });
    const comparison = compareCodingEvalReports(baseline, candidate);

    expect(comparison).toMatchObject({
      taskSetId: "coding-harness-v1",
      meanScoreDeltaPercent: 27.27,
      passRateDeltaPercent: 100,
      medianDurationDeltaMs: 0,
      medianFirstActionDeltaMs: 0,
      medianObservedActionCountDelta: 0,
      tasks: [
        {
          taskId: task.id,
          caseId: task.caseId,
          scoreDeltaPercent: 27.27,
        },
      ],
    });
  });

  it("rejects comparison when fixture identity differs", () => {
    const baseline = createReport({
      runId: "baseline-run",
      status: "pass",
      score: 110,
      routeLabel: "route-old",
    });
    const candidate = createReport({
      runId: "candidate-run",
      status: "pass",
      score: 110,
      routeLabel: "route-new",
      fixtureId: "starter-revision:def456",
    });

    expect(() => compareCodingEvalReports(baseline, candidate)).toThrow(
      "schema, suite version, task set, or fixture differs",
    );
  });

  it("rejects comparison across evaluator package versions", () => {
    const baseline = createReport({
      runId: "baseline-run",
      status: "pass",
      score: 110,
      routeLabel: "codex-current",
    });
    const candidate = createReport({
      runId: "candidate-run",
      status: "pass",
      score: 110,
      routeLabel: "codex-current",
    });

    expect(() =>
      compareCodingEvalReports(baseline, {
        ...candidate,
        evaluator: { ...candidate.evaluator, version: "0.3.0" },
      }),
    ).toThrow("evaluator, schema, suite version, task set, or fixture differs");
  });

  it("keeps the report evaluator version aligned with its workspace manifest", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { evaluatorVersion?: unknown };

    expect(CODING_EVAL_PACKAGE_VERSION).toBe(manifest.evaluatorVersion);
  });

  it("persists reports with private permissions and lists them for management", () => {
    const directory = temporaryDirectory();
    const report = createReport({
      runId: "baseline-run",
      status: "pass",
      score: 110,
      routeLabel: "codex-current",
    });
    const path = writeCodingEvalReport(report, directory);
    const listed = listCodingEvalReportFiles(directory);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.path).toBe(path);
    expect(readCodingEvalReport(path)).toMatchObject({
      suite: { id: "coding-harness", version: 1 },
      taskSetId: "coding-harness-v1",
      comparisonReady: true,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf8"))).not.toHaveProperty(
      "workspace",
    );
  });

  it("does not mark unpaired one-off runs comparison-ready", () => {
    const report = createCodingEvalReport({
      workspace: "/workspace",
      runs: [
        {
          evaluation: evaluation("ad-hoc-run", "pass", 110),
          run: { runId: "ad-hoc-run", status: "complete" },
        },
      ],
    });

    expect(report.comparisonReady).toBe(false);
    expect(() => compareCodingEvalReports(report, report)).toThrow(
      "marked comparison-ready",
    );
  });

  it("rejects broad output directories without changing their permissions", () => {
    // Even a regression must never chmod a real home/root/workspace in a test.
    vi.mocked(fchmodSync).mockImplementation(() => {
      throw new Error("Unsafe chmod reached in broad-directory test");
    });
    const report = createReport({
      runId: "safe-run",
      status: "pass",
      score: 110,
      routeLabel: "test",
    });
    for (const directory of [
      parse(resolve("/")).root,
      homedir(),
      process.cwd(),
    ]) {
      const previousMode = statSync(directory).mode;
      expect(() => writeCodingEvalReport(report, directory)).toThrow(
        "dedicated",
      );
      expect(statSync(directory).mode).toBe(previousMode);
    }
    expect(fchmodSync).not.toHaveBeenCalled();
  });

  it("rejects a linked report directory, preserves its target, and permits recovery", () => {
    const parent = temporaryDirectory();
    const target = temporaryDirectory();
    const link = join(parent, "reports");
    const report = createReport({
      runId: "safe-run",
      status: "pass",
      score: 110,
      routeLabel: "test",
    });
    symlinkSync(target, link, "dir");
    const previousMode = statSync(target).mode;
    expect(() => writeCodingEvalReport(report, link)).toThrow();
    expect(statSync(target).mode).toBe(previousMode);
    expect(listCodingEvalReportFiles(target)).toEqual([]);
    unlinkSync(link);
    const output = writeCodingEvalReport(report, link);
    expect(readCodingEvalReport(output).runs[0]?.runId).toBe("safe-run");
  });

  it("rejects malformed or task-mismatched persisted reports", () => {
    const report = createReport({
      runId: "baseline-run",
      status: "pass",
      score: 110,
      routeLabel: "codex-current",
    });

    expect(() =>
      parseCodingEvalReport({ ...report, summary: { totalRuns: "one" } }),
    ).toThrow("not a comparison-ready Doolittle coding evaluation report");
    expect(() =>
      parseCodingEvalReport({
        ...report,
        runs: [{ ...report.runs[0], taskId: "another-task" }],
      }),
    ).toThrow("not a comparison-ready Doolittle coding evaluation report");
  });

  it("keeps reports ad hoc when task-set metadata does not match the suite", () => {
    const report = createCodingEvalReport({
      workspace: "/workspace",
      suite,
      taskSetId: "wrong-task-set",
      fixtureId: "starter-revision:abc123",
      runs: [
        {
          taskId: task.id,
          evaluation: evaluation("ad-hoc-run", "pass", 110),
          run: { runId: "ad-hoc-run", status: "complete" },
        },
      ],
    });

    expect(report.comparisonReady).toBe(false);
  });
});
