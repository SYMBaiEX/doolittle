import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { CODING_EVAL_SUITES, type CodingEvalSuite } from "./cases";
import type { CodingEvalStatus, CodingRunEvaluation } from "./evaluator";

export const CODING_EVAL_REPORT_SCHEMA_VERSION = 1 as const;
export const CODING_EVAL_PACKAGE_VERSION = "0.1.0" as const;

export interface CodingEvalReportCheck {
  id: string;
  status: CodingEvalStatus;
  weight: number;
  evidenceCount: number;
  evidenceSha256: string;
}

export interface CodingEvalReportRun {
  runId: string;
  taskId: string | null;
  caseId: string;
  status: CodingRunEvaluation["status"];
  score: number;
  maxScore: number;
  checks: CodingEvalReportCheck[];
  metrics: {
    durationMs: number | null;
    firstActionMs: number | null;
    observedActionCount: number | null;
    recoveredBuilds: number;
  };
}

export interface CodingEvalReport {
  schemaVersion: typeof CODING_EVAL_REPORT_SCHEMA_VERSION;
  evaluator: { package: "@doolittle/evals"; version: string };
  createdAt: string;
  suite: { id: string; version: number } | null;
  taskSetId: string | null;
  fixtureId: string | null;
  workspaceSha256: string;
  routeLabel: string | null;
  comparisonReady: boolean;
  summary: {
    totalRuns: number;
    pass: number;
    fail: number;
    incomplete: number;
    meanScorePercent: number | null;
    passRatePercent: number | null;
  };
  effort: {
    medianDurationMs: number | null;
    medianFirstActionMs: number | null;
    medianObservedActionCount: number | null;
    recoveredBuildRuns: number;
  };
  runs: CodingEvalReportRun[];
}

export interface CodingEvalRunInput {
  run: Record<string, unknown>;
  evaluation: CodingRunEvaluation;
  taskId?: string;
}

export interface CreateCodingEvalReportInput {
  workspace: string;
  runs: CodingEvalRunInput[];
  suite?: Pick<CodingEvalSuite, "id" | "version" | "tasks">;
  taskSetId?: string;
  fixtureId?: string;
  routeLabel?: string;
  createdAt?: string;
}

export interface CodingEvalComparison {
  suiteId: string;
  suiteVersion: number;
  taskSetId: string;
  fixtureId: string;
  baseline: CodingEvalReport["summary"] & {
    routeLabel: string | null;
    effort: CodingEvalReport["effort"];
  };
  candidate: CodingEvalReport["summary"] & {
    routeLabel: string | null;
    effort: CodingEvalReport["effort"];
  };
  meanScoreDeltaPercent: number;
  passRateDeltaPercent: number;
  medianDurationDeltaMs: number | null;
  medianFirstActionDeltaMs: number | null;
  medianObservedActionCountDelta: number | null;
  tasks: Array<{
    taskId: string;
    caseId: string;
    baseline: Pick<CodingEvalReportRun, "status" | "score" | "maxScore">;
    candidate: Pick<CodingEvalReportRun, "status" | "score" | "maxScore">;
    scoreDeltaPercent: number;
  }>;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finiteMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function elapsedMs(start: unknown, end: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined
    ? null
    : Math.round((lower + upper) / 2);
}

export function createCodingEvalReport(
  input: CreateCodingEvalReportInput,
): CodingEvalReport {
  if (input.runs.length === 0) {
    throw new Error(
      "A coding evaluation report must contain at least one run.",
    );
  }

  const taskIds = input.runs.flatMap(({ taskId }) => (taskId ? [taskId] : []));
  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error(
      "Task IDs must be unique within a coding evaluation report.",
    );
  }
  if (input.suite && taskIds.length === input.runs.length) {
    const suiteTaskIds = new Set(input.suite.tasks.map((task) => task.id));
    if (
      suiteTaskIds.size !== input.suite.tasks.length ||
      taskIds.length !== input.suite.tasks.length ||
      taskIds.some((taskId) => !suiteTaskIds.has(taskId))
    ) {
      throw new Error(
        "Comparable reports must include every suite task exactly once.",
      );
    }
    for (const { taskId, evaluation } of input.runs) {
      const task = input.suite.tasks.find((entry) => entry.id === taskId);
      if (!task || task.caseId !== evaluation.caseId) {
        throw new Error(
          `Task ${String(taskId)} does not match its versioned acceptance case.`,
        );
      }
    }
  }
  if (input.routeLabel && !/^[a-z0-9._-]{1,80}$/iu.test(input.routeLabel)) {
    throw new Error(
      "Route labels may contain only letters, numbers, dots, underscores, and hyphens (up to 80 characters).",
    );
  }
  if (input.fixtureId && !/^[a-z0-9._:-]{1,120}$/iu.test(input.fixtureId)) {
    throw new Error(
      "Fixture IDs may contain only letters, numbers, dots, underscores, colons, and hyphens (up to 120 characters).",
    );
  }

  const runs: CodingEvalReportRun[] = input.runs.map(
    ({ run, evaluation, taskId }) => {
      const durationMs = elapsedMs(run.startedAt, run.endedAt ?? run.updatedAt);
      const firstActionMs = elapsedMs(run.startedAt, run.firstActionAt);
      const observedActionCount = finiteMetric(run.observedActionCount);
      const buildCheck = evaluation.checks.find(
        (entry) => entry.id === "build",
      );

      return {
        runId: evaluation.runId,
        taskId: taskId ?? null,
        caseId: evaluation.caseId,
        status: evaluation.status,
        score: evaluation.score,
        maxScore: evaluation.maxScore,
        checks: evaluation.checks.map((entry) => ({
          id: entry.id,
          status: entry.status,
          weight: entry.weight,
          evidenceCount: entry.evidence.length,
          evidenceSha256: digest(JSON.stringify(entry.evidence)),
        })),
        metrics: {
          durationMs,
          firstActionMs,
          observedActionCount,
          recoveredBuilds:
            buildCheck?.evidence.filter((entry) =>
              entry.startsWith("Recovered after "),
            ).length ?? 0,
        },
      };
    },
  );

  const pass = runs.filter((run) => run.status === "pass").length;
  const fail = runs.filter((run) => run.status === "fail").length;
  const incomplete = runs.filter((run) => run.status === "incomplete").length;
  const normalizedScores = runs.flatMap((run) =>
    run.maxScore > 0 ? [(run.score / run.maxScore) * 100] : [],
  );
  const durations = runs.flatMap((run) =>
    run.metrics.durationMs === null ? [] : [run.metrics.durationMs],
  );
  const firstActions = runs.flatMap((run) =>
    run.metrics.firstActionMs === null ? [] : [run.metrics.firstActionMs],
  );
  const actionCounts = runs.flatMap((run) =>
    run.metrics.observedActionCount === null
      ? []
      : [run.metrics.observedActionCount],
  );
  const taskMappingComplete =
    Boolean(
      input.suite &&
        input.taskSetId === `${input.suite.id}-v${input.suite.version}` &&
        input.fixtureId?.trim(),
    ) && taskIds.length === runs.length;

  return {
    schemaVersion: CODING_EVAL_REPORT_SCHEMA_VERSION,
    evaluator: {
      package: "@doolittle/evals",
      version: CODING_EVAL_PACKAGE_VERSION,
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
    suite: input.suite ?? null,
    taskSetId: input.taskSetId ?? null,
    fixtureId: input.fixtureId ?? null,
    workspaceSha256: digest(resolve(input.workspace)),
    routeLabel: input.routeLabel ?? null,
    comparisonReady: taskMappingComplete,
    summary: {
      totalRuns: runs.length,
      pass,
      fail,
      incomplete,
      meanScorePercent:
        normalizedScores.length > 0
          ? Number(
              (
                normalizedScores.reduce((sum, score) => sum + score, 0) /
                normalizedScores.length
              ).toFixed(2),
            )
          : null,
      passRatePercent: Number(((pass / runs.length) * 100).toFixed(2)),
    },
    effort: {
      medianDurationMs: median(durations),
      medianFirstActionMs: median(firstActions),
      medianObservedActionCount: median(actionCounts),
      recoveredBuildRuns: runs.filter((run) => run.metrics.recoveredBuilds > 0)
        .length,
    },
    runs,
  };
}

export function defaultCodingEvalReportDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.DOOLITTLE_EVAL_HOME;
  if (explicit) return resolve(explicit);
  const stateHome = env.XDG_STATE_HOME;
  if (stateHome && isAbsolute(stateHome)) {
    return join(stateHome, "doolittle", "evals");
  }
  return join(homedir(), ".local", "state", "doolittle", "evals");
}

export function writeCodingEvalReport(
  report: CodingEvalReport,
  reportDirectory = defaultCodingEvalReportDirectory(),
): string {
  const directory = resolve(reportDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const label = (report.suite?.id ?? "coding-eval").replace(
    /[^a-z0-9-]+/giu,
    "-",
  );
  const timestamp = report.createdAt.replace(/[^0-9a-z-]+/giu, "-");
  const outputPath = join(
    directory,
    `${timestamp}-${label}-${randomUUID()}.json`,
  );
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(outputPath, 0o600);
  return outputPath;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableNonEmptyString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableFiniteNonNegative(value: unknown): value is number | null {
  return value === null || finiteNonNegative(value);
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    typeof maximum === "number" &&
    value <= maximum
  );
}

function codingStatus(value: unknown): value is CodingEvalStatus {
  return (
    value === "pass" ||
    value === "fail" ||
    value === "unknown" ||
    value === "n/a"
  );
}

function runStatus(value: unknown): value is CodingRunEvaluation["status"] {
  return value === "pass" || value === "fail" || value === "incomplete";
}

function validReportRun(value: unknown): value is CodingEvalReportRun {
  const run = object(value);
  const metrics = object(run?.metrics);
  if (
    !run ||
    !metrics ||
    !nonEmptyString(run.runId) ||
    !(run.taskId === null || nonEmptyString(run.taskId)) ||
    !nonEmptyString(run.caseId) ||
    !runStatus(run.status) ||
    !finiteNonNegative(run.score) ||
    !finiteNonNegative(run.maxScore) ||
    run.score > run.maxScore ||
    !Array.isArray(run.checks) ||
    run.checks.length === 0 ||
    !nullableFiniteNonNegative(metrics.durationMs) ||
    !nullableFiniteNonNegative(metrics.firstActionMs) ||
    !nullableFiniteNonNegative(metrics.observedActionCount) ||
    !integerBetween(metrics.recoveredBuilds, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }

  return run.checks.every((checkValue) => {
    const check = object(checkValue);
    return (
      Boolean(check) &&
      nonEmptyString(check?.id) &&
      codingStatus(check?.status) &&
      finiteNonNegative(check?.weight) &&
      integerBetween(check?.evidenceCount, 0, Number.MAX_SAFE_INTEGER) &&
      typeof check?.evidenceSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(check.evidenceSha256)
    );
  });
}

export function parseCodingEvalReport(value: unknown): CodingEvalReport {
  const report = object(value);
  const suite = object(report?.suite);
  const summary = object(report?.summary);
  const effort = object(report?.effort);
  const suiteValid =
    report?.suite === null ||
    (nonEmptyString(suite?.id) && integerBetween(suite.version, 1, 100_000));
  const suiteDefinition = suite
    ? Object.values(CODING_EVAL_SUITES).find(
        (entry) => entry.id === suite.id && entry.version === suite.version,
      )
    : undefined;
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  const parsedRunsValid = runs.length > 0 && runs.every(validReportRun);
  const summaryCountsValid = (() => {
    if (!summary) return false;
    const totalRuns = summary.totalRuns;
    const pass = summary.pass;
    const fail = summary.fail;
    const incomplete = summary.incomplete;
    return (
      integerBetween(totalRuns, 1, Number.MAX_SAFE_INTEGER) &&
      integerBetween(pass, 0, totalRuns) &&
      integerBetween(fail, 0, totalRuns) &&
      integerBetween(incomplete, 0, totalRuns) &&
      pass + fail + incomplete === totalRuns &&
      nullableFiniteNonNegative(summary.meanScorePercent) &&
      (summary.meanScorePercent === null || summary.meanScorePercent <= 100) &&
      nullableFiniteNonNegative(summary.passRatePercent) &&
      (summary.passRatePercent === null || summary.passRatePercent <= 100)
    );
  })();
  const effortValid =
    effort &&
    nullableFiniteNonNegative(effort.medianDurationMs) &&
    nullableFiniteNonNegative(effort.medianFirstActionMs) &&
    nullableFiniteNonNegative(effort.medianObservedActionCount) &&
    integerBetween(
      effort.recoveredBuildRuns,
      0,
      typeof summary?.totalRuns === "number" ? summary.totalRuns : -1,
    );
  const comparisonMappingValid =
    !report?.comparisonReady ||
    (suiteDefinition !== undefined &&
      report.taskSetId === `${suite?.id}-v${suite?.version}` &&
      nullableNonEmptyString(report.fixtureId) &&
      typeof report.fixtureId === "string" &&
      report.fixtureId.trim().length > 0 &&
      runs.length === suiteDefinition.tasks.length &&
      runs.every((runValue) => {
        const run = object(runValue);
        const task = suiteDefinition.tasks.find(
          (entry) => entry.id === run?.taskId,
        );
        return Boolean(task && task.caseId === run?.caseId);
      }) &&
      new Set(runs.map((runValue) => object(runValue)?.taskId)).size ===
        runs.length &&
      new Set(runs.map((runValue) => object(runValue)?.runId)).size ===
        runs.length);
  if (
    report?.schemaVersion !== CODING_EVAL_REPORT_SCHEMA_VERSION ||
    !object(report?.evaluator) ||
    object(report.evaluator)?.package !== "@doolittle/evals" ||
    !nonEmptyString(object(report.evaluator)?.version) ||
    typeof report.comparisonReady !== "boolean" ||
    !nullableNonEmptyString(report.taskSetId) ||
    !nullableNonEmptyString(report.fixtureId) ||
    typeof report.workspaceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(report.workspaceSha256) ||
    !nullableNonEmptyString(report.routeLabel) ||
    !suiteValid ||
    !nonEmptyString(report.createdAt) ||
    !Number.isFinite(Date.parse(report.createdAt)) ||
    !summaryCountsValid ||
    !effortValid ||
    runs.length !== summary?.totalRuns ||
    !parsedRunsValid ||
    !comparisonMappingValid
  ) {
    throw new Error(
      "This file is not a comparison-ready Doolittle coding evaluation report.",
    );
  }

  return report as unknown as CodingEvalReport;
}

export function readCodingEvalReport(path: string): CodingEvalReport {
  return parseCodingEvalReport(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}

function finiteDelta(candidate: number | null, baseline: number | null) {
  return candidate === null || baseline === null ? null : candidate - baseline;
}

function scorePercent(run: CodingEvalReportRun): number {
  return run.maxScore > 0 ? (run.score / run.maxScore) * 100 : 0;
}

export function compareCodingEvalReports(
  baseline: CodingEvalReport,
  candidate: CodingEvalReport,
): CodingEvalComparison {
  if (!baseline.comparisonReady || !candidate.comparisonReady) {
    throw new Error("Both reports must be marked comparison-ready.");
  }
  if (
    baseline.schemaVersion !== candidate.schemaVersion ||
    baseline.evaluator.package !== candidate.evaluator.package ||
    baseline.evaluator.version !== candidate.evaluator.version ||
    baseline.suite?.id !== candidate.suite?.id ||
    baseline.suite?.version !== candidate.suite?.version ||
    baseline.taskSetId !== candidate.taskSetId ||
    baseline.fixtureId !== candidate.fixtureId
  ) {
    throw new Error(
      "Reports are not comparable: evaluator, schema, suite version, task set, or fixture differs.",
    );
  }

  const baselineTasks = new Map(
    baseline.runs.map((run) => [run.taskId, run] as const),
  );
  const candidateTasks = new Map(
    candidate.runs.map((run) => [run.taskId, run] as const),
  );
  if (
    baselineTasks.size !== baseline.runs.length ||
    candidateTasks.size !== candidate.runs.length ||
    [...baselineTasks.keys()].some((taskId) => taskId === null) ||
    [...candidateTasks.keys()].some((taskId) => taskId === null)
  ) {
    throw new Error("Comparable reports require one unique task ID per run.");
  }
  const baselineRunIds = new Set(baseline.runs.map((run) => run.runId));
  if (candidate.runs.some((run) => baselineRunIds.has(run.runId))) {
    throw new Error("Baseline and candidate must contain different run IDs.");
  }
  if (
    baselineTasks.size !== candidateTasks.size ||
    [...baselineTasks.keys()].some((taskId) => !candidateTasks.has(taskId))
  ) {
    throw new Error("Reports must contain the same exact set of task IDs.");
  }

  const tasks = [...baselineTasks.entries()].map(([taskId, base]) => {
    const next = candidateTasks.get(taskId);
    if (!next || base.caseId !== next.caseId) {
      throw new Error(
        `Task ${String(taskId)} uses a different acceptance case.`,
      );
    }
    return {
      taskId: String(taskId),
      caseId: base.caseId,
      baseline: {
        status: base.status,
        score: base.score,
        maxScore: base.maxScore,
      },
      candidate: {
        status: next.status,
        score: next.score,
        maxScore: next.maxScore,
      },
      scoreDeltaPercent: Number(
        (scorePercent(next) - scorePercent(base)).toFixed(2),
      ),
    };
  });

  const meanScoreDelta = finiteDelta(
    candidate.summary.meanScorePercent,
    baseline.summary.meanScorePercent,
  );
  const passRateDelta = finiteDelta(
    candidate.summary.passRatePercent,
    baseline.summary.passRatePercent,
  );
  if (meanScoreDelta === null || passRateDelta === null) {
    throw new Error("Reports are missing aggregate comparison metrics.");
  }

  return {
    suiteId: baseline.suite?.id ?? "",
    suiteVersion: baseline.suite?.version ?? 0,
    taskSetId: baseline.taskSetId ?? "",
    fixtureId: baseline.fixtureId ?? "",
    baseline: {
      ...baseline.summary,
      routeLabel: baseline.routeLabel,
      effort: baseline.effort,
    },
    candidate: {
      ...candidate.summary,
      routeLabel: candidate.routeLabel,
      effort: candidate.effort,
    },
    meanScoreDeltaPercent: Number(meanScoreDelta.toFixed(2)),
    passRateDeltaPercent: Number(passRateDelta.toFixed(2)),
    medianDurationDeltaMs: finiteDelta(
      candidate.effort.medianDurationMs,
      baseline.effort.medianDurationMs,
    ),
    medianFirstActionDeltaMs: finiteDelta(
      candidate.effort.medianFirstActionMs,
      baseline.effort.medianFirstActionMs,
    ),
    medianObservedActionCountDelta: finiteDelta(
      candidate.effort.medianObservedActionCount,
      baseline.effort.medianObservedActionCount,
    ),
    tasks,
  };
}

export function listCodingEvalReportFiles(
  reportDirectory = defaultCodingEvalReportDirectory(),
): Array<{ path: string; report: CodingEvalReport }> {
  const directory = resolve(reportDirectory);
  let entries: string[];
  try {
    entries = readdirSync(directory).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    const code = object(error)?.code;
    if (code === "ENOENT") return [];
    throw error;
  }
  return entries
    .map((entry) => {
      const path = join(directory, entry);
      return {
        path,
        report: parseCodingEvalReport(
          JSON.parse(readFileSync(path, "utf8")) as unknown,
        ),
      };
    })
    .sort((left, right) =>
      right.report.createdAt.localeCompare(left.report.createdAt),
    );
}
