import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateHeadlessEvalReports,
  compareHeadlessEvalReports,
  readHeadlessEvalReport,
} from "./compare";

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

function v3Report(overrides: Record<string, unknown> = {}) {
  const base = v2Report();
  return {
    ...base,
    schemaVersion: 3,
    evaluatorVersion: "0.2.0",
    runs: (base.runs as Array<Record<string, unknown>>).map((run) => ({
      ...run,
      timing: {
        ...(run.timing as Record<string, unknown>),
        execInvocations: 1,
      },
      modelUsage: {
        provider: "codex",
        providerCalls: 2,
        completedCalls: 2,
        failedCalls: 0,
        providerDurationMs: 80,
        firstTextSamples: 2,
        meanFirstTextMs: 25,
        tokenUsageSamples: 2,
        inputTokens: 100,
        outputTokens: 30,
        totalTokens: 130,
        costUsd: null,
      },
    })),
    ...overrides,
  };
}

function v4Report(overrides: Record<string, unknown> = {}) {
  const base = v3Report();
  return {
    ...base,
    schemaVersion: 4,
    evaluatorVersion: "0.2.4",
    source: { revision: "a".repeat(40), workingTreeClean: true },
    runs: (base.runs as Array<Record<string, unknown>>).map((run) => ({
      ...run,
      timing: {
        ...(run.timing as Record<string, unknown>),
        execToFirstAssistantTextMs:
          25 + Number((run.timing as Record<string, unknown>).execDurationMs),
      },
      traceSummary: {
        journalAvailable: true,
        malformed: false,
        modelRequests: 2,
        modelResponses: 2,
        modelErrors: 0,
        mutationContinuations: 0,
        continuationReasons: {
          "explicitly-incomplete-response": 0,
          "unverified-terminal-response": 0,
          "empty-terminal-response": 0,
        },
        maxContinuationAttempt: null,
        promptChars: { samples: 2, min: 10, max: 20, mean: 15 },
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

  it("compares paired exec-to-first-assistant-text timings", () => {
    const baseline = v4Report();
    const candidate = {
      ...baseline,
      runs: (baseline.runs as Array<Record<string, unknown>>).map((run) => ({
        ...run,
        timing: {
          ...(run.timing as Record<string, unknown>),
          execToFirstAssistantTextMs:
            Number(
              (run.timing as Record<string, unknown>)
                .execToFirstAssistantTextMs,
            ) + 15,
        },
      })),
    };

    const result = compareHeadlessEvalReports(baseline, candidate);
    expect(result.pairedFirstAssistantTextTaskCount).toBe(2);
    expect(result.meanExecToFirstAssistantTextDeltaMs).toBe(15);
    expect(
      result.tasks.map((task) => task.execToFirstAssistantTextDeltaMs),
    ).toEqual([15, 15]);
  });

  it("rejects invalid exec-to-first-assistant-text timings", () => {
    const base = v4Report();
    const malformed = {
      ...base,
      runs: (base.runs as Array<Record<string, unknown>>).map((run, index) =>
        index === 0
          ? {
              ...run,
              timing: {
                ...(run.timing as Record<string, unknown>),
                execToFirstAssistantTextMs: -1,
              },
            }
          : run,
      ),
    };
    expect(() => compareHeadlessEvalReports(malformed, malformed)).toThrow();
  });

  it("keeps the new timing unavailable for older schema-v4 evaluator reports", () => {
    const base = v4Report();
    const legacy = {
      ...base,
      evaluatorVersion: "0.2.3",
      runs: (base.runs as Array<Record<string, unknown>>).map((run) => {
        const timing = { ...(run.timing as Record<string, unknown>) };
        delete timing.execToFirstAssistantTextMs;
        return { ...run, timing };
      }),
    };

    const result = compareHeadlessEvalReports(legacy, legacy);
    expect(result.pairedFirstAssistantTextTaskCount).toBe(0);
    expect(result.meanExecToFirstAssistantTextDeltaMs).toBeNull();
    expect(
      result.tasks.map((task) => task.execToFirstAssistantTextDeltaMs),
    ).toEqual([null, null]);
  });

  it("compares Codex provider timing and token signals for schema v3", () => {
    const baseline = v3Report();
    const candidate = v3Report({
      runs: (v3Report().runs as Array<Record<string, unknown>>).map((run) => {
        const usage = run.modelUsage as Record<string, unknown>;
        return {
          ...run,
          modelUsage: {
            ...usage,
            providerDurationMs: 100,
            meanFirstTextMs: 35,
            inputTokens: 110,
            outputTokens: 35,
            totalTokens: 145,
          },
        };
      }),
    });
    const result = compareHeadlessEvalReports(baseline, candidate);

    expect(result.schemaVersion).toBe(3);
    expect(result.providerUsage).toMatchObject({
      pairedTaskCount: 2,
      totalTaskCount: 2,
      baseline: {
        providerCalls: 4,
        providerDurationMs: 160,
        meanFirstTextMs: 25,
        tokenUsageSamples: 4,
        inputTokens: 200,
        outputTokens: 60,
        totalTokens: 260,
        costUsd: null,
      },
      candidate: {
        providerCalls: 4,
        providerDurationMs: 200,
        meanFirstTextMs: 35,
        tokenUsageSamples: 4,
        inputTokens: 220,
        outputTokens: 70,
        totalTokens: 290,
        costUsd: null,
      },
    });
    expect(() => compareHeadlessEvalReports(v2Report(), candidate)).toThrow(
      /Invalid or incompatible/,
    );
  });

  it("compares schema-v4 telemetry and records source identities", () => {
    const baseline = v4Report();
    const candidate = v4Report({
      source: { revision: "b".repeat(40), workingTreeClean: true },
    });
    const result = compareHeadlessEvalReports(baseline, candidate);
    expect(result.schemaVersion).toBe(4);
    expect(result.source).toEqual({
      baseline: { revision: "a".repeat(40), workingTreeClean: true },
      candidate: { revision: "b".repeat(40), workingTreeClean: true },
    });
    expect(result.providerUsage?.pairedTaskCount).toBe(2);
  });

  it("requires explicit provider metrics on schema v3 reports", () => {
    const base = v3Report();
    const runs = base.runs as Array<Record<string, unknown>>;
    const firstUsage = runs[0]?.modelUsage as Record<string, unknown>;
    const invalidReports = [
      v3Report({
        runs: runs.map((run, index) =>
          index === 0 ? { ...run, modelUsage: undefined } : run,
        ),
      }),
      v3Report({
        runs: runs.map((run, index) =>
          index === 0
            ? {
                ...run,
                modelUsage: { ...firstUsage, inputTokens: -1 },
              }
            : run,
        ),
      }),
      v3Report({
        runs: runs.map((run, index) =>
          index === 0
            ? { ...run, modelUsage: { ...firstUsage, costUsd: 0.01 } }
            : run,
        ),
      }),
    ];
    for (const malformed of invalidReports) {
      expect(() => compareHeadlessEvalReports(malformed, malformed)).toThrow(
        /Invalid or incompatible/,
      );
    }
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

  it("preserves evaluator-version metadata when reading reports from disk", () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-eval-compare-"));
    try {
      const baselinePath = join(directory, "baseline.json");
      const candidatePath = join(directory, "candidate.json");
      const legacy = report();

      writeFileSync(baselinePath, JSON.stringify(legacy));
      writeFileSync(
        candidatePath,
        JSON.stringify(report({ evaluatorVersion: "unversioned" })),
      );
      expect(() =>
        compareHeadlessEvalReports(
          readHeadlessEvalReport(baselinePath),
          readHeadlessEvalReport(candidatePath),
        ),
      ).toThrow(/Invalid or incompatible/);

      writeFileSync(
        baselinePath,
        JSON.stringify(report({ evaluatorVersion: 1 })),
      );
      writeFileSync(
        candidatePath,
        JSON.stringify(report({ evaluatorVersion: "1" })),
      );
      expect(() =>
        compareHeadlessEvalReports(
          readHeadlessEvalReport(baselinePath),
          readHeadlessEvalReport(candidatePath),
        ),
      ).toThrow(/Invalid or incompatible/);
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

describe("headless repeated report aggregation", () => {
  function repeatedReport(
    suiteWallTimeMs: number,
    execDurationMs: number[],
    execInvocations: number[],
    options: {
      statuses?: string[];
      checks?: boolean[][];
      modelUsage?: Array<Record<string, unknown> | null>;
      diagnosticFlags?: string[][];
      modelResponses?: number[];
      modelErrors?: number[];
      execToFirstAssistantTextMs?: Array<number | null>;
    } = {},
  ) {
    const base = v4Report();
    const baseRuns = base.runs as Array<Record<string, unknown>>;
    return {
      ...base,
      createdAt: new Date(1_760_000_000_000 + suiteWallTimeMs).toISOString(),
      summary: { ...base.summary, suiteWallTimeMs },
      runs: baseRuns.map((run, index) => ({
        ...run,
        status: options.statuses?.[index] ?? run.status,
        checks: (run.checks as Array<Record<string, unknown>>).map(
          (check, checkIndex) => ({
            ...check,
            passed: options.checks?.[index]?.[checkIndex] ?? check.passed,
          }),
        ),
        timing: {
          ...(run.timing as Record<string, unknown>),
          execDurationMs: execDurationMs[index],
          execInvocations: execInvocations[index],
          ...(options.execToFirstAssistantTextMs &&
          index in options.execToFirstAssistantTextMs
            ? {
                execToFirstAssistantTextMs:
                  options.execToFirstAssistantTextMs[index],
              }
            : {}),
        },
        modelUsage:
          options.modelUsage && index in options.modelUsage
            ? options.modelUsage[index]
            : run.modelUsage,
        traceSummary: {
          ...(run.traceSummary as Record<string, unknown>),
          ...(options.modelResponses && index in options.modelResponses
            ? { modelResponses: options.modelResponses[index] }
            : {}),
          ...(options.modelErrors && index in options.modelErrors
            ? { modelErrors: options.modelErrors[index] }
            : {}),
        },
        diagnosticFlags: options.diagnosticFlags?.[index] ?? [],
      })),
    };
  }

  it("aggregates repeat outcomes and nearest-rank p90 only across compatible runs", () => {
    const first = repeatedReport(500, [100, 200], [1, 1], {
      checks: [[true, false], [true]],
      diagnosticFlags: [["memory-unavailable", "memory-unavailable"], []],
      modelResponses: [1, 2],
      modelErrors: [1, 0],
      execToFirstAssistantTextMs: [10, null],
    });
    const second = repeatedReport(700, [300, 400], [3, 3], {
      statuses: ["failed", "completed"],
      checks: [[false, false], [true]],
      modelUsage: [null, null],
      diagnosticFlags: [["memory-unavailable"], []],
      modelResponses: [2, 2],
      modelErrors: [0, 0],
      execToFirstAssistantTextMs: [20, null],
    });
    const third = repeatedReport(600, [200, 300], [2, 2], {
      checks: [[true, false], [true]],
      diagnosticFlags: [[], []],
      modelResponses: [3, 2],
      modelErrors: [2, 0],
      execToFirstAssistantTextMs: [30, null],
    });

    const result = aggregateHeadlessEvalReports([first, second, third]);
    expect(result).toMatchObject({
      suiteId: "suite",
      suiteVersion: 4,
      schemaVersion: 4,
      source: { revision: "a".repeat(40), workingTreeClean: true },
      evaluatorVersion: "0.2.4",
      routeLabel: "route",
      reportSamples: 3,
      taskSamples: 6,
      executionCompletions: 5,
      executionCompletionRate: 5 / 6,
      objectiveChecksPassed: 5,
      objectiveChecksTotal: 9,
      objectiveCheckPassRate: 5 / 9,
      suiteWallTimeMs: {
        count: 3,
        min: 500,
        median: 600,
        p90: 700,
        max: 700,
        mean: 600,
      },
    });
    expect(result.tasks[0]).toMatchObject({
      taskId: "task-a",
      sampleCount: 3,
      executionCompletions: 2,
      executionCompletionRate: 2 / 3,
      checks: [
        { id: "check-a", passed: 2, samples: 3, passRate: 2 / 3 },
        { id: "check-b", passed: 0, samples: 3, passRate: 0 },
      ],
      execDurationMs: {
        count: 3,
        min: 100,
        median: 200,
        p90: 300,
        max: 300,
        mean: 200,
      },
      execToFirstAssistantTextMs: {
        count: 3,
        min: 10,
        median: 20,
        p90: 30,
        max: 30,
        mean: 20,
      },
      execInvocations: {
        count: 3,
        min: 1,
        median: 2,
        p90: 3,
        max: 3,
        mean: 2,
      },
      providerMetrics: { sampleCount: 2 },
      traceMetrics: {
        sampleCount: 3,
        modelRequests: {
          count: 3,
          min: 2,
          median: 2,
          p90: 2,
          max: 2,
          mean: 2,
        },
        modelResponses: {
          count: 3,
          min: 1,
          median: 2,
          p90: 3,
          max: 3,
          mean: 2,
        },
        modelErrors: {
          count: 3,
          min: 0,
          median: 1,
          p90: 2,
          max: 2,
          mean: 1,
        },
        mutationContinuations: {
          count: 3,
          min: 0,
          median: 0,
          p90: 0,
          max: 0,
          mean: 0,
        },
        meanPromptChars: {
          count: 3,
          min: 15,
          median: 15,
          p90: 15,
          max: 15,
          mean: 15,
        },
      },
      diagnosticFlags: [{ flag: "memory-unavailable", samples: 2 }],
    });
    expect(result.tasks[1]?.execDurationMs.mean).toBe(300);
    expect(result.tasks[0]?.providerMetrics.providerCalls?.count).toBe(2);
    expect(result.tasks[0]?.providerMetrics.totalTokens?.count).toBe(2);
  });

  it("keeps unavailable provider telemetry null", () => {
    const withoutUsage = (suiteWallTimeMs: number) =>
      repeatedReport(suiteWallTimeMs, [100, 200], [1, 1], {
        modelUsage: [null, null],
      });
    const result = aggregateHeadlessEvalReports([
      withoutUsage(100),
      withoutUsage(200),
    ]);
    expect(result.tasks[0]?.providerMetrics).toEqual({
      sampleCount: 0,
      providerCalls: null,
      providerDurationMs: null,
      totalTokens: null,
    });
  });

  it("rejects too few or incompatible reports", () => {
    const baseline = repeatedReport(500, [100, 200], [1, 1]);
    expect(() => aggregateHeadlessEvalReports([baseline])).toThrow(
      /At least two reports/,
    );
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        repeatedReport(501, [100, 200], [1, 1], {
          modelUsage: [null, null],
        }),
      ]),
    ).not.toThrow();
    expect(() => aggregateHeadlessEvalReports([baseline, baseline])).toThrow(
      /Invalid or incompatible/,
    );
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(501, [100, 200], [1, 1]),
          routeLabel: "another-route",
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(505, [100, 200], [1, 1]),
          source: { revision: "b".repeat(40), workingTreeClean: true },
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(506, [100, 200], [1, 1]),
          source: { revision: "a".repeat(40), workingTreeClean: false },
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(502, [100, 200], [1, 1]),
          evaluatorVersion: "0.3.0",
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(503, [100, 200], [1, 1]),
          runs: (
            repeatedReport(503, [100, 200], [1, 1]).runs as Array<
              Record<string, unknown>
            >
          ).map((run, index) =>
            index === 0
              ? {
                  ...run,
                  checks: [
                    { id: "changed-check", passed: true },
                    { id: "check-b", passed: false },
                  ],
                }
              : run,
          ),
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
    expect(() =>
      aggregateHeadlessEvalReports([
        baseline,
        {
          ...repeatedReport(504, [100, 200], [1, 1]),
          schemaVersion: 3,
        },
      ]),
    ).toThrow(/Invalid or incompatible/);
  });
});
