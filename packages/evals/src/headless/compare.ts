import { readFileSync } from "node:fs";

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

type Check = { id: string; passed: boolean };
type Run = {
  taskId: string;
  domain: string;
  status: "completed" | "failed";
  elapsedMs: number;
  comparisonDurationMs: number;
  timing?: {
    taskSetupMs: number;
    execDurationMs: number;
    gradingMs: number;
  };
  checks: Check[];
};
type Report = {
  schemaVersion: 1 | 2;
  evaluatorVersion: string;
  explicitEvaluatorVersion?: string | number;
  suite: { id: string; version: number };
  summary?: { suiteWallTimeMs: number };
  runs: Run[];
};

export interface HeadlessTaskDelta {
  taskId: string;
  domain: string;
  baseline: {
    executionCompleted: boolean;
    checksPassed: number;
    checksTotal: number;
    durationMs: number;
  };
  candidate: {
    executionCompleted: boolean;
    checksPassed: number;
    checksTotal: number;
    durationMs: number;
  };
  executionCompletionDelta: number;
  objectiveCheckSuccessDelta: number;
  durationDeltaMs: number;
}

export interface HeadlessReportComparison {
  suiteId: string;
  suiteVersion: number;
  schemaVersion: number;
  durationMetric: string;
  evaluatorVersion: string;
  sampleSize: number;
  baseline: {
    executionCompletions: number;
    taskTotal: number;
    checkSuccesses: number;
    checkTotal: number;
  };
  candidate: {
    executionCompletions: number;
    taskTotal: number;
    checkSuccesses: number;
    checkTotal: number;
  };
  executionCompletionDelta: number;
  objectiveCheckSuccessDelta: number;
  meanDurationDeltaMs: number;
  tasks: HeadlessTaskDelta[];
}

function invalid(): never {
  throw new Error("Invalid or incompatible headless evaluation reports.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluatorVersion(value: unknown): string {
  if (value === undefined) return "unversioned";
  if (typeof value === "string" && value.trim()) return value;
  if (Number.isInteger(value) && Number(value) > 0) return String(value);
  return invalid();
}

function parseReport(value: unknown): Report {
  if (!isRecord(value)) return invalid();
  const schemaVersion = value.schemaVersion;
  if (
    !Number.isInteger(schemaVersion) ||
    !SUPPORTED_SCHEMA_VERSIONS.has(Number(schemaVersion)) ||
    !isRecord(value.suite) ||
    !string(value.suite.id) ||
    !Number.isInteger(value.suite.version) ||
    Number(value.suite.version) < 1 ||
    !Array.isArray(value.runs) ||
    value.runs.length === 0
  )
    return invalid();

  const schema = Number(schemaVersion) as 1 | 2;
  let suiteWallTimeMs: number | undefined;
  if (schema === 2) {
    if (
      !string(value.evaluatorVersion) ||
      !isRecord(value.summary) ||
      typeof value.summary.suiteWallTimeMs !== "number" ||
      !Number.isFinite(value.summary.suiteWallTimeMs) ||
      value.summary.suiteWallTimeMs < 0
    )
      return invalid();
    suiteWallTimeMs = value.summary.suiteWallTimeMs;
  }

  const taskIds = new Set<string>();
  const runs = value.runs.map((raw): Run => {
    if (
      !isRecord(raw) ||
      !string(raw.taskId) ||
      taskIds.has(raw.taskId) ||
      !string(raw.domain) ||
      (raw.status !== "completed" && raw.status !== "failed") ||
      typeof raw.elapsedMs !== "number" ||
      !Number.isFinite(raw.elapsedMs) ||
      raw.elapsedMs < 0 ||
      !Array.isArray(raw.checks) ||
      raw.checks.length === 0
    )
      return invalid();

    let comparisonDurationMs = raw.elapsedMs;
    let timing: Run["timing"];
    if (schema === 2) {
      const rawTiming = raw.timing;
      if (
        !isRecord(rawTiming) ||
        typeof rawTiming.taskSetupMs !== "number" ||
        !Number.isFinite(rawTiming.taskSetupMs) ||
        rawTiming.taskSetupMs < 0 ||
        typeof rawTiming.execDurationMs !== "number" ||
        !Number.isFinite(rawTiming.execDurationMs) ||
        rawTiming.execDurationMs < 0 ||
        typeof rawTiming.gradingMs !== "number" ||
        !Number.isFinite(rawTiming.gradingMs) ||
        rawTiming.gradingMs < 0
      )
        return invalid();
      timing = {
        taskSetupMs: rawTiming.taskSetupMs,
        execDurationMs: rawTiming.execDurationMs,
        gradingMs: rawTiming.gradingMs,
      };
      comparisonDurationMs = timing.execDurationMs;
    }
    taskIds.add(raw.taskId);
    const checkIds = new Set<string>();
    const checks = raw.checks.map((check): Check => {
      if (
        !isRecord(check) ||
        !string(check.id) ||
        checkIds.has(check.id) ||
        typeof check.passed !== "boolean"
      )
        return invalid();
      checkIds.add(check.id);
      return { id: check.id, passed: check.passed };
    });
    return {
      taskId: raw.taskId,
      domain: raw.domain,
      status: raw.status,
      elapsedMs: raw.elapsedMs,
      comparisonDurationMs,
      ...(timing ? { timing } : {}),
      checks,
    };
  });

  return {
    schemaVersion: schema,
    evaluatorVersion: evaluatorVersion(value.evaluatorVersion),
    ...(value.evaluatorVersion !== undefined
      ? { explicitEvaluatorVersion: value.evaluatorVersion as string | number }
      : {}),
    suite: { id: value.suite.id, version: Number(value.suite.version) },
    ...(suiteWallTimeMs !== undefined ? { summary: { suiteWallTimeMs } } : {}),
    runs,
  };
}

export function readHeadlessEvalReport(path: string): Report {
  try {
    return parseReport(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return invalid();
  }
}

function executionCompleted(run: Run): boolean {
  return run.status === "completed";
}

function checksPassed(run: Run): number {
  return run.checks.filter((check) => check.passed).length;
}

function ratioDelta(
  candidate: number,
  candidateTotal: number,
  baseline: number,
  baselineTotal: number,
): number {
  return candidate / candidateTotal - baseline / baselineTotal;
}

export function compareHeadlessEvalReports(
  baselineInput: unknown,
  candidateInput: unknown,
): HeadlessReportComparison {
  const baseline = parseReport(baselineInput);
  const candidate = parseReport(candidateInput);
  if (
    baseline.schemaVersion !== candidate.schemaVersion ||
    baseline.evaluatorVersion !== candidate.evaluatorVersion ||
    baseline.explicitEvaluatorVersion !== candidate.explicitEvaluatorVersion ||
    baseline.suite.id !== candidate.suite.id ||
    baseline.suite.version !== candidate.suite.version
  )
    return invalid();

  const durationMetric =
    baseline.schemaVersion === 2
      ? "timing.execDurationMs (end-to-end Nub exec child invocation; includes CLI startup, provider/model, and tool time)"
      : "legacy elapsedMs (wall-clock from before exec through response parsing and grading)";

  const baselineById = new Map(baseline.runs.map((run) => [run.taskId, run]));
  const candidateById = new Map(candidate.runs.map((run) => [run.taskId, run]));
  if (
    baselineById.size !== candidateById.size ||
    [...baselineById.keys()].some((id) => !candidateById.has(id))
  )
    return invalid();

  const tasks: HeadlessTaskDelta[] = [];
  for (const [taskId, base] of baselineById) {
    const next = candidateById.get(taskId);
    if (
      !next ||
      base.domain !== next.domain ||
      base.checks.length !== next.checks.length ||
      base.checks.some((check, index) => check.id !== next.checks[index]?.id)
    )
      return invalid();
    const baseCompleted = executionCompleted(base);
    const nextCompleted = executionCompleted(next);
    tasks.push({
      taskId,
      domain: base.domain,
      baseline: {
        executionCompleted: baseCompleted,
        checksPassed: checksPassed(base),
        checksTotal: base.checks.length,
        durationMs: base.comparisonDurationMs,
      },
      candidate: {
        executionCompleted: nextCompleted,
        checksPassed: checksPassed(next),
        checksTotal: next.checks.length,
        durationMs: next.comparisonDurationMs,
      },
      executionCompletionDelta: Number(nextCompleted) - Number(baseCompleted),
      objectiveCheckSuccessDelta: ratioDelta(
        checksPassed(next),
        next.checks.length,
        checksPassed(base),
        base.checks.length,
      ),
      durationDeltaMs: next.comparisonDurationMs - base.comparisonDurationMs,
    });
  }

  const baselineExecutionCompletions = tasks.filter(
    (task) => task.baseline.executionCompleted,
  ).length;
  const candidateExecutionCompletions = tasks.filter(
    (task) => task.candidate.executionCompleted,
  ).length;
  const baselineCheckSuccesses = tasks.reduce(
    (sum, task) => sum + task.baseline.checksPassed,
    0,
  );
  const candidateCheckSuccesses = tasks.reduce(
    (sum, task) => sum + task.candidate.checksPassed,
    0,
  );
  const checkTotal = tasks.reduce(
    (sum, task) => sum + task.baseline.checksTotal,
    0,
  );
  return {
    suiteId: baseline.suite.id,
    suiteVersion: baseline.suite.version,
    schemaVersion: baseline.schemaVersion,
    durationMetric,
    evaluatorVersion: baseline.evaluatorVersion,
    sampleSize: tasks.length,
    baseline: {
      executionCompletions: baselineExecutionCompletions,
      taskTotal: tasks.length,
      checkSuccesses: baselineCheckSuccesses,
      checkTotal,
    },
    candidate: {
      executionCompletions: candidateExecutionCompletions,
      taskTotal: tasks.length,
      checkSuccesses: candidateCheckSuccesses,
      checkTotal,
    },
    executionCompletionDelta:
      candidateExecutionCompletions / tasks.length -
      baselineExecutionCompletions / tasks.length,
    objectiveCheckSuccessDelta:
      candidateCheckSuccesses / checkTotal -
      baselineCheckSuccesses / checkTotal,
    meanDurationDeltaMs:
      tasks.reduce((sum, task) => sum + task.durationDeltaMs, 0) / tasks.length,
    tasks,
  };
}
