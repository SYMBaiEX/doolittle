import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareHeadlessEvalReports, readHeadlessEvalReport } from "./compare";

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    suite: { id: "suite", version: 4, title: "private title" },
    routeLabel: "route",
    route: { provider: "provider", model: "model", reasoningEffort: "medium" },
    createdAt: "2026-10-01T00:00:00.000Z",
    executionOverrides: [],
    summary: {
      total: 2,
      completed: 2,
      objectiveChecksPassed: 2,
      objectiveChecksTotal: 3,
      humanReviewRequired: 2,
    },
    runs: [
      {
        taskId: "task-a",
        domain: "conversation",
        status: "completed",
        elapsedMs: 100,
        checks: [
          { id: "check-a", passed: true },
          { id: "check-b", passed: false },
        ],
      },
      {
        taskId: "task-b",
        domain: "coding",
        status: "completed",
        elapsedMs: 200,
        checks: [{ id: "check-c", passed: true }],
      },
    ],
    ...overrides,
  };
}

function v2Report(overrides: Record<string, unknown> = {}) {
  const base = report();
  return {
    ...base,
    schemaVersion: 2,
    evaluatorVersion: "0.1.0",
    summary: { ...base.summary, suiteWallTimeMs: 500 },
    runs: base.runs.map((run, index) => ({
      ...run,
      timing: {
        taskSetupMs: 10 + index,
        execDurationMs: 100 + index * 100,
        gradingMs: 2,
      },
    })),
    ...overrides,
  };
}

describe("headless report comparison", () => {
  it("compares paired objective outcomes and legacy elapsed time for schema v1", () => {
    const baseline = report();
    const candidate = report({
      runs: [
        {
          taskId: "task-a",
          domain: "conversation",
          status: "completed",
          elapsedMs: 80,
          checks: [
            { id: "check-a", passed: true },
            { id: "check-b", passed: true },
          ],
        },
        {
          taskId: "task-b",
          domain: "coding",
          status: "failed",
          elapsedMs: 250,
          checks: [{ id: "check-c", passed: true }],
        },
      ],
    });
    const result = compareHeadlessEvalReports(baseline, candidate);

    expect(result).toMatchObject({
      suiteId: "suite",
      suiteVersion: 4,
      sampleSize: 2,
      baseline: {
        executionCompletions: 2,
        taskTotal: 2,
        checkSuccesses: 2,
        checkTotal: 3,
      },
      candidate: {
        executionCompletions: 1,
        taskTotal: 2,
        checkSuccesses: 3,
        checkTotal: 3,
      },
      executionCompletionDelta: -0.5,
      meanDurationDeltaMs: 15,
      durationMetric:
        "legacy elapsedMs (wall-clock from before exec through response parsing and grading)",
    });
    expect(result.objectiveCheckSuccessDelta).toBeCloseTo(1 / 3);
    expect(result.tasks.map(({ durationDeltaMs }) => durationDeltaMs)).toEqual([
      -20, 50,
    ]);
  });

  it("uses schema v2 execDurationMs instead of legacy elapsedMs", () => {
    const baseline = v2Report({
      runs: (v2Report().runs as Array<Record<string, unknown>>).map((run) => ({
        ...run,
        elapsedMs: 10_000,
      })),
    });
    const candidate = v2Report({
      runs: (v2Report().runs as Array<Record<string, unknown>>).map((run) => ({
        ...run,
        elapsedMs: 1,
        timing: {
          ...(run.timing as Record<string, number>),
          execDurationMs:
            (run.timing as Record<string, number>).execDurationMs + 25,
        },
      })),
    });
    const result = compareHeadlessEvalReports(baseline, candidate);
    expect(result.schemaVersion).toBe(2);
    expect(result.meanDurationDeltaMs).toBe(25);
    expect(result.durationMetric).toContain("timing.execDurationMs");
    expect(() => compareHeadlessEvalReports(report(), candidate)).toThrow(
      /Invalid or incompatible/,
    );
  });

  it("compares persisted schema v2 reports after reading them from disk", () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-eval-compare-"));
    try {
      const baselinePath = join(directory, "baseline.json");
      const candidatePath = join(directory, "candidate.json");
      const baseline = v2Report();
      const candidate = v2Report({
        runs: (v2Report().runs as Array<Record<string, unknown>>).map(
          (run) => ({
            ...run,
            timing: {
              ...(run.timing as Record<string, number>),
              execDurationMs:
                (run.timing as Record<string, number>).execDurationMs + 10,
            },
          }),
        ),
      });
      writeFileSync(baselinePath, JSON.stringify(baseline));
      writeFileSync(candidatePath, JSON.stringify(candidate));

      const result = compareHeadlessEvalReports(
        readHeadlessEvalReport(baselinePath),
        readHeadlessEvalReport(candidatePath),
      );
      expect(result.meanDurationDeltaMs).toBe(10);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects missing, malformed, or negative schema v2 timing measurements", () => {
    const base = v2Report();
    const runs = base.runs as Array<Record<string, unknown>>;
    const invalidCases = [
      v2Report({
        runs: runs.map((run, i) =>
          i === 0 ? { ...run, timing: undefined } : run,
        ),
      }),
      v2Report({
        runs: runs.map((run, i) =>
          i === 0 ? { ...run, timing: { taskSetupMs: 1, gradingMs: 1 } } : run,
        ),
      }),
      v2Report({
        runs: runs.map((run, i) =>
          i === 0
            ? {
                ...run,
                timing: {
                  taskSetupMs: 1,
                  execDurationMs: 10,
                },
              }
            : run,
        ),
      }),
      v2Report({
        runs: runs.map((run, i) =>
          i === 0
            ? { ...run, timing: { ...(run.timing as object), taskSetupMs: -1 } }
            : run,
        ),
      }),
      v2Report({
        runs: runs.map((run, i) =>
          i === 0
            ? {
                ...run,
                timing: { ...(run.timing as object), execDurationMs: -1 },
              }
            : run,
        ),
      }),
      v2Report({
        runs: runs.map((run, i) =>
          i === 0
            ? { ...run, timing: { ...(run.timing as object), gradingMs: -1 } }
            : run,
        ),
      }),
      v2Report({ summary: { ...base.summary, suiteWallTimeMs: undefined } }),
      v2Report({ summary: { ...base.summary, suiteWallTimeMs: -1 } }),
    ];
    for (const malformed of invalidCases) {
      expect(() => compareHeadlessEvalReports(malformed, base)).toThrow(
        /Invalid or incompatible/,
      );
    }
  });

  it("requires evaluator-version metadata for schema v2 reports", () => {
    const { evaluatorVersion: _evaluatorVersion, ...unversioned } = v2Report();
    expect(() => compareHeadlessEvalReports(unversioned, unversioned)).toThrow(
      /Invalid or incompatible/,
    );
    expect(() =>
      compareHeadlessEvalReports(
        v2Report(),
        v2Report({ evaluatorVersion: " " }),
      ),
    ).toThrow(/Invalid or incompatible/);
  });

  it("keeps execution completion separate when all objective checks fail", () => {
    const completedWithFailedChecks = v2Report({
      runs: (v2Report().runs as Array<Record<string, unknown>>).map((run) => ({
        ...run,
        status: "completed",
        checks: (run.checks as Array<Record<string, unknown>>).map((check) => ({
          ...check,
          passed: false,
        })),
      })),
    });
    const result = compareHeadlessEvalReports(
      completedWithFailedChecks,
      completedWithFailedChecks,
    );
    expect(result.baseline.executionCompletions).toBe(2);
    expect(result.baseline.checkSuccesses).toBe(0);
    expect(result.executionCompletionDelta).toBe(0);
    expect(result.objectiveCheckSuccessDelta).toBe(0);
  });

  it("requires evaluator compatibility without inventing a version for legacy reports", () => {
    expect(
      compareHeadlessEvalReports(report(), report()).evaluatorVersion,
    ).toBe("unversioned");
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({ evaluatorVersion: "checks-v2" }),
      ),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({ evaluatorVersion: "unversioned" }),
      ),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      compareHeadlessEvalReports(
        report({ evaluatorVersion: "checks-v1" }),
        report({ evaluatorVersion: "checks-v2" }),
      ),
    ).toThrow(/Invalid or incompatible/);
  });

  it("rejects suite, task, domain, and check mismatches", () => {
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({ suite: { id: "other", version: 4 } }),
      ),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({ suite: { id: "suite", version: 5 } }),
      ),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({ runs: [report().runs[0]] }),
      ),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({
          runs: (report().runs as Array<Record<string, unknown>>).map(
            (run, index) =>
              index === 0 ? { ...run, domain: "research" } : run,
          ),
        }),
      ),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(
        report(),
        report({
          runs: (report().runs as Array<Record<string, unknown>>).map(
            (run, index) =>
              index === 0
                ? {
                    ...run,
                    checks: [
                      { id: "changed", passed: true },
                      { id: "check-b", passed: false },
                    ],
                  }
                : run,
          ),
        }),
      ),
    ).toThrow();
  });

  it("rejects malformed, duplicate, or invalid measurements", () => {
    expect(() => compareHeadlessEvalReports(null, report())).toThrow();
    expect(() =>
      compareHeadlessEvalReports(
        report({ schemaVersion: 3 }),
        report({ schemaVersion: 3 }),
      ),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(report({ runs: [] }), report({ runs: [] })),
    ).toThrow();
    const invalidTime = report({
      runs: [{ ...report().runs[0], elapsedMs: Number.NaN }, report().runs[1]],
    });
    expect(() =>
      compareHeadlessEvalReports(invalidTime, invalidTime),
    ).toThrow();
    const duplicateTask = report({
      runs: [report().runs[0], report().runs[0]],
    });
    expect(() =>
      compareHeadlessEvalReports(duplicateTask, duplicateTask),
    ).toThrow();
    const duplicateCheck = report({
      runs: [
        {
          ...report().runs[0],
          checks: [
            { id: "same", passed: true },
            { id: "same", passed: false },
          ],
        },
        report().runs[1],
      ],
    });
    expect(() =>
      compareHeadlessEvalReports(duplicateCheck, duplicateCheck),
    ).toThrow();
  });
});
