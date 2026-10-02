import { readFileSync } from "node:fs";

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3, 4]);

type Check = { id: string; passed: boolean };
type TraceSummary = {
  journalAvailable: boolean;
  malformed: boolean;
  modelRequests: number;
  modelResponses: number;
  modelErrors: number;
  mutationContinuations: number;
  continuationReasons: {
    "explicitly-incomplete-response": number;
    "unverified-terminal-response": number;
    "empty-terminal-response": number;
  };
  maxContinuationAttempt: number | null;
  promptChars: {
    samples: number;
    min: number;
    max: number;
    mean: number;
  } | null;
};
type SourceIdentity = {
  revision: string | null;
  workingTreeClean: boolean | null;
};
export type ModelUsage = {
  provider: "codex";
  providerCalls: number;
  completedCalls: number;
  failedCalls: number;
  providerDurationMs: number;
  firstTextSamples: number;
  meanFirstTextMs: number | null;
  tokenUsageSamples: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: null;
};
type Run = {
  taskId: string;
  domain: string;
  status: "completed" | "failed";
  elapsedMs: number;
  comparisonDurationMs: number;
  timing?: {
    taskSetupMs: number;
    execDurationMs: number;
    execInvocations?: number;
    execToFirstAssistantTextMs?: number | null;
    gradingMs: number;
  };
  modelUsage?: ModelUsage | null;
  traceSummary?: TraceSummary;
  humanReviewRequired?: boolean;
  diagnosticFlags?: string[];
  checks: Check[];
};
type Report = {
  schemaVersion: 1 | 2 | 3 | 4;
  evaluatorVersion: string;
  explicitEvaluatorVersion?: string | number;
  createdAt?: string;
  suite: { id: string; version: number };
  summary?: { suiteWallTimeMs: number };
  routeLabel?: string;
  route?: { provider: string; model: string; reasoningEffort: string };
  source?: SourceIdentity;
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
    execToFirstAssistantTextMs: number | null;
  };
  candidate: {
    executionCompleted: boolean;
    checksPassed: number;
    checksTotal: number;
    durationMs: number;
    execToFirstAssistantTextMs: number | null;
  };
  executionCompletionDelta: number;
  objectiveCheckSuccessDelta: number;
  durationDeltaMs: number;
  execToFirstAssistantTextDeltaMs: number | null;
  modelUsage: {
    baseline: ModelUsage | null;
    candidate: ModelUsage | null;
  } | null;
}

export interface HeadlessProviderUsageComparison {
  pairedTaskCount: number;
  totalTaskCount: number;
  baseline: ModelUsage | null;
  candidate: ModelUsage | null;
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
  pairedFirstAssistantTextTaskCount: number;
  meanExecToFirstAssistantTextDeltaMs: number | null;
  source?: { baseline: SourceIdentity; candidate: SourceIdentity };
  providerUsage?: HeadlessProviderUsageComparison;
  tasks: HeadlessTaskDelta[];
}

export interface HeadlessMetricDistribution {
  count: number;
  min: number;
  median: number;
  p90: number;
  max: number;
  mean: number;
}

export interface HeadlessTaskAggregate {
  taskId: string;
  domain: string;
  sampleCount: number;
  executionCompletions: number;
  executionCompletionRate: number;
  checks: Array<{
    id: string;
    passed: number;
    samples: number;
    passRate: number;
  }>;
  execDurationMs: HeadlessMetricDistribution;
  execToFirstAssistantTextMs: HeadlessMetricDistribution | null;
  execInvocations: HeadlessMetricDistribution;
  providerMetrics: {
    sampleCount: number;
    providerCalls: HeadlessMetricDistribution | null;
    providerDurationMs: HeadlessMetricDistribution | null;
    totalTokens: HeadlessMetricDistribution | null;
  };
  traceMetrics: {
    sampleCount: number;
    modelRequests: HeadlessMetricDistribution | null;
    modelResponses: HeadlessMetricDistribution | null;
    modelErrors: HeadlessMetricDistribution | null;
    mutationContinuations: HeadlessMetricDistribution | null;
    meanPromptChars: HeadlessMetricDistribution | null;
  };
  diagnosticFlags: Array<{ flag: string; samples: number }>;
}

export interface HeadlessReportAggregate {
  suiteId: string;
  suiteVersion: number;
  schemaVersion: 4;
  evaluatorVersion: string;
  routeLabel: string;
  route: { provider: string; model: string; reasoningEffort: string };
  source: { revision: string; workingTreeClean: true };
  reportSamples: number;
  taskSamples: number;
  executionCompletions: number;
  executionCompletionRate: number;
  objectiveChecksPassed: number;
  objectiveChecksTotal: number;
  objectiveCheckPassRate: number;
  suiteWallTimeMs: HeadlessMetricDistribution;
  tasks: HeadlessTaskAggregate[];
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

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || nonNegativeInteger(value);
}

function parseTraceSummary(value: unknown): TraceSummary | null {
  if (
    !isRecord(value) ||
    typeof value.journalAvailable !== "boolean" ||
    typeof value.malformed !== "boolean" ||
    !nonNegativeInteger(value.modelRequests) ||
    !nonNegativeInteger(value.modelResponses) ||
    !nonNegativeInteger(value.modelErrors) ||
    !nonNegativeInteger(value.mutationContinuations) ||
    !isRecord(value.continuationReasons) ||
    !nonNegativeInteger(
      value.continuationReasons["explicitly-incomplete-response"],
    ) ||
    !nonNegativeInteger(
      value.continuationReasons["unverified-terminal-response"],
    ) ||
    !nonNegativeInteger(value.continuationReasons["empty-terminal-response"]) ||
    !nullableNonNegativeInteger(value.maxContinuationAttempt)
  ) {
    return null;
  }
  let promptChars: TraceSummary["promptChars"];
  if (value.promptChars === null) {
    promptChars = null;
  } else if (
    isRecord(value.promptChars) &&
    nonNegativeInteger(value.promptChars.samples) &&
    value.promptChars.samples > 0 &&
    nonNegativeInteger(value.promptChars.min) &&
    nonNegativeInteger(value.promptChars.max) &&
    nonNegativeInteger(value.promptChars.mean) &&
    value.promptChars.min <= value.promptChars.mean &&
    value.promptChars.mean <= value.promptChars.max
  ) {
    promptChars = {
      samples: value.promptChars.samples,
      min: value.promptChars.min,
      max: value.promptChars.max,
      mean: value.promptChars.mean,
    };
  } else {
    return null;
  }
  return {
    journalAvailable: value.journalAvailable,
    malformed: value.malformed,
    modelRequests: value.modelRequests,
    modelResponses: value.modelResponses,
    modelErrors: value.modelErrors,
    mutationContinuations: value.mutationContinuations,
    continuationReasons: {
      "explicitly-incomplete-response":
        value.continuationReasons["explicitly-incomplete-response"],
      "unverified-terminal-response":
        value.continuationReasons["unverified-terminal-response"],
      "empty-terminal-response":
        value.continuationReasons["empty-terminal-response"],
    },
    maxContinuationAttempt: value.maxContinuationAttempt,
    promptChars,
  };
}

function parseModelUsage(value: unknown): ModelUsage | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    value.provider !== "codex" ||
    !nonNegativeInteger(value.providerCalls) ||
    !nonNegativeInteger(value.completedCalls) ||
    !nonNegativeInteger(value.failedCalls) ||
    value.completedCalls + value.failedCalls !== value.providerCalls ||
    !nonNegativeInteger(value.providerDurationMs) ||
    !nonNegativeInteger(value.firstTextSamples) ||
    !(
      value.meanFirstTextMs === null ||
      nonNegativeInteger(value.meanFirstTextMs)
    ) ||
    !nonNegativeInteger(value.tokenUsageSamples) ||
    !nullableNonNegativeInteger(value.inputTokens) ||
    !nullableNonNegativeInteger(value.outputTokens) ||
    !nullableNonNegativeInteger(value.totalTokens) ||
    value.costUsd !== null
  ) {
    return invalid();
  }
  const tokenFields = [
    value.inputTokens,
    value.outputTokens,
    value.totalTokens,
  ];
  if (
    tokenFields.some((field) => field === null) &&
    tokenFields.some((field) => field !== null)
  ) {
    return invalid();
  }
  if (
    value.tokenUsageSamples > value.providerCalls ||
    value.firstTextSamples > value.providerCalls ||
    (value.tokenUsageSamples === 0 &&
      tokenFields.some((field) => field !== null)) ||
    (value.firstTextSamples === 0) !== (value.meanFirstTextMs === null)
  ) {
    return invalid();
  }
  return {
    provider: "codex",
    providerCalls: value.providerCalls,
    completedCalls: value.completedCalls,
    failedCalls: value.failedCalls,
    providerDurationMs: value.providerDurationMs,
    firstTextSamples: value.firstTextSamples,
    meanFirstTextMs: value.meanFirstTextMs,
    tokenUsageSamples: value.tokenUsageSamples,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
    costUsd: null,
  };
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

  const schema = Number(schemaVersion) as 1 | 2 | 3 | 4;
  let createdAt: string | undefined;
  if (value.createdAt !== undefined) {
    if (
      !string(value.createdAt) ||
      !Number.isFinite(Date.parse(value.createdAt))
    ) {
      return invalid();
    }
    createdAt = value.createdAt;
  }
  if (schema >= 3 && createdAt === undefined) return invalid();
  let suiteWallTimeMs: number | undefined;
  if (schema >= 2) {
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
  let routeLabel: string | undefined;
  if (value.routeLabel !== undefined) {
    if (!string(value.routeLabel)) return invalid();
    routeLabel = value.routeLabel;
  }
  let route: Report["route"];
  if (value.route !== undefined) {
    if (
      !isRecord(value.route) ||
      !string(value.route.provider) ||
      !string(value.route.model) ||
      !string(value.route.reasoningEffort)
    ) {
      return invalid();
    }
    route = {
      provider: value.route.provider,
      model: value.route.model,
      reasoningEffort: value.route.reasoningEffort,
    };
  }
  let source: SourceIdentity | undefined;
  if (schema === 4) {
    if (
      !isRecord(value.source) ||
      !(
        value.source.revision === null ||
        (typeof value.source.revision === "string" &&
          /^[a-f0-9]{40}$/i.test(value.source.revision))
      ) ||
      !(
        value.source.workingTreeClean === null ||
        typeof value.source.workingTreeClean === "boolean"
      )
    ) {
      return invalid();
    }
    source = {
      revision: value.source.revision,
      workingTreeClean: value.source.workingTreeClean,
    };
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
    if (schema >= 2) {
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
      if (
        schema >= 3 &&
        (!nonNegativeInteger(rawTiming.execInvocations) ||
          rawTiming.execInvocations < 1)
      ) {
        return invalid();
      }
      if (
        Object.hasOwn(rawTiming, "execToFirstAssistantTextMs") &&
        !nullableNonNegativeInteger(rawTiming.execToFirstAssistantTextMs)
      ) {
        return invalid();
      }
      timing = {
        taskSetupMs: rawTiming.taskSetupMs,
        execDurationMs: rawTiming.execDurationMs,
        ...(schema >= 3
          ? { execInvocations: Number(rawTiming.execInvocations) }
          : {}),
        ...(Object.hasOwn(rawTiming, "execToFirstAssistantTextMs")
          ? {
              execToFirstAssistantTextMs:
                rawTiming.execToFirstAssistantTextMs as number | null,
            }
          : {}),
        gradingMs: rawTiming.gradingMs,
      };
      comparisonDurationMs = timing.execDurationMs;
    }
    let modelUsage: ModelUsage | null | undefined;
    if (schema >= 3) {
      if (!Object.hasOwn(raw, "modelUsage")) return invalid();
      modelUsage = parseModelUsage(raw.modelUsage);
    }
    let traceSummary: TraceSummary | undefined;
    if (schema === 4) {
      traceSummary = parseTraceSummary(raw.traceSummary) ?? undefined;
      if (!traceSummary) return invalid();
    }
    let humanReviewRequired: boolean | undefined;
    if (raw.humanReviewRequired !== undefined) {
      if (typeof raw.humanReviewRequired !== "boolean") return invalid();
      humanReviewRequired = raw.humanReviewRequired;
    }
    let diagnosticFlags: string[] | undefined;
    if (raw.diagnosticFlags !== undefined) {
      if (
        !Array.isArray(raw.diagnosticFlags) ||
        raw.diagnosticFlags.some((flag) => !string(flag))
      ) {
        return invalid();
      }
      diagnosticFlags = raw.diagnosticFlags as string[];
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
      ...(schema >= 3 ? { modelUsage } : {}),
      ...(traceSummary ? { traceSummary } : {}),
      ...(humanReviewRequired !== undefined ? { humanReviewRequired } : {}),
      ...(diagnosticFlags ? { diagnosticFlags } : {}),
      checks,
    };
  });

  return {
    schemaVersion: schema,
    evaluatorVersion: evaluatorVersion(value.evaluatorVersion),
    ...(value.evaluatorVersion !== undefined
      ? { explicitEvaluatorVersion: value.evaluatorVersion as string | number }
      : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    suite: { id: value.suite.id, version: Number(value.suite.version) },
    ...(suiteWallTimeMs !== undefined ? { summary: { suiteWallTimeMs } } : {}),
    ...(routeLabel !== undefined ? { routeLabel } : {}),
    ...(route ? { route } : {}),
    ...(source ? { source } : {}),
    runs,
  };
}

export function readHeadlessEvalReport(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return invalid();
  }
}

function distribution(values: number[]): HeadlessMetricDistribution {
  if (values.length === 0) return invalid();
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    median,
    p90: sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

function optionalDistribution(
  values: number[],
): HeadlessMetricDistribution | null {
  return values.length === 0 ? null : distribution(values);
}

/**
 * Aggregate repeated reports only when they represent the same exact route,
 * evaluator, suite, tasks, and checks. This is descriptive statistics, not a
 * quality score or a causal comparison.
 */
export function aggregateHeadlessEvalReports(
  inputs: readonly unknown[],
): HeadlessReportAggregate {
  if (inputs.length < 2) {
    throw new Error(
      "At least two reports are required for repeat aggregation.",
    );
  }
  const reports = inputs.map(parseReport);
  const baseline = reports[0];
  if (
    baseline?.schemaVersion !== 4 ||
    !baseline.routeLabel ||
    !baseline.route ||
    !baseline.source ||
    !baseline.source.revision ||
    baseline.source.workingTreeClean !== true ||
    baseline.summary?.suiteWallTimeMs === undefined
  ) {
    return invalid();
  }

  const sameRoute = (candidate: Report) =>
    candidate.routeLabel === baseline.routeLabel &&
    candidate.route?.provider === baseline.route?.provider &&
    candidate.route?.model === baseline.route?.model &&
    candidate.route?.reasoningEffort === baseline.route?.reasoningEffort;
  const referenceTasks = new Map(baseline.runs.map((run) => [run.taskId, run]));
  const reportTimes = new Set<string>();
  for (const report of reports) {
    if (
      report.schemaVersion !== 4 ||
      !report.createdAt ||
      reportTimes.has(report.createdAt) ||
      report.evaluatorVersion !== baseline.evaluatorVersion ||
      report.explicitEvaluatorVersion !== baseline.explicitEvaluatorVersion ||
      report.suite.id !== baseline.suite.id ||
      report.suite.version !== baseline.suite.version ||
      report.summary?.suiteWallTimeMs === undefined ||
      report.source?.revision !== baseline.source.revision ||
      report.source.workingTreeClean !== true ||
      !sameRoute(report) ||
      report.runs.length !== referenceTasks.size
    ) {
      return invalid();
    }
    reportTimes.add(report.createdAt);
    for (const run of report.runs) {
      const reference = referenceTasks.get(run.taskId);
      if (
        !reference ||
        run.domain !== reference.domain ||
        !run.timing ||
        run.timing.execInvocations === undefined ||
        run.checks.length !== reference.checks.length ||
        run.checks.some(
          (check, index) => check.id !== reference.checks[index]?.id,
        ) ||
        run.humanReviewRequired !== reference.humanReviewRequired
      ) {
        return invalid();
      }
    }
  }

  const tasks: HeadlessTaskAggregate[] = baseline.runs.map((reference) => {
    const samples = reports.flatMap((report) => {
      const run = report.runs.find(
        (candidate) => candidate.taskId === reference.taskId,
      );
      return run ? [run] : [];
    });
    const providerMetrics = samples.flatMap((run) =>
      run.modelUsage ? [run.modelUsage] : [],
    );
    const traceMetrics = samples.flatMap((run) =>
      run.traceSummary?.journalAvailable ? [run.traceSummary] : [],
    );
    const diagnostics = new Map<string, number>();
    for (const run of samples) {
      for (const flag of new Set(run.diagnosticFlags ?? [])) {
        diagnostics.set(flag, (diagnostics.get(flag) ?? 0) + 1);
      }
    }
    const timedRuns = samples.flatMap((run) =>
      run.timing ? [run.timing] : [],
    );
    if (timedRuns.length !== samples.length) return invalid();
    const completed = samples.filter(executionCompleted).length;

    return {
      taskId: reference.taskId,
      domain: reference.domain,
      sampleCount: samples.length,
      executionCompletions: completed,
      executionCompletionRate: completed / samples.length,
      checks: reference.checks.map((check, index) => {
        const passed = samples.filter(
          (run) => run.checks[index]?.passed === true,
        ).length;
        return {
          id: check.id,
          passed,
          samples: samples.length,
          passRate: passed / samples.length,
        };
      }),
      execDurationMs: distribution(
        timedRuns.map((timing) => timing.execDurationMs),
      ),
      execToFirstAssistantTextMs: optionalDistribution(
        timedRuns.flatMap((timing) =>
          typeof timing.execToFirstAssistantTextMs === "number"
            ? [timing.execToFirstAssistantTextMs]
            : [],
        ),
      ),
      execInvocations: distribution(
        timedRuns.map((timing) => timing.execInvocations ?? 0),
      ),
      providerMetrics: {
        sampleCount: providerMetrics.length,
        providerCalls: optionalDistribution(
          providerMetrics.map((usage) => usage.providerCalls),
        ),
        providerDurationMs: optionalDistribution(
          providerMetrics.map((usage) => usage.providerDurationMs),
        ),
        totalTokens: optionalDistribution(
          providerMetrics.flatMap((usage) =>
            usage.totalTokens === null ? [] : [usage.totalTokens],
          ),
        ),
      },
      traceMetrics: {
        sampleCount: traceMetrics.length,
        modelRequests: optionalDistribution(
          traceMetrics.map((trace) => trace.modelRequests),
        ),
        modelResponses: optionalDistribution(
          traceMetrics.map((trace) => trace.modelResponses),
        ),
        modelErrors: optionalDistribution(
          traceMetrics.map((trace) => trace.modelErrors),
        ),
        mutationContinuations: optionalDistribution(
          traceMetrics.map((trace) => trace.mutationContinuations),
        ),
        meanPromptChars: optionalDistribution(
          traceMetrics.flatMap((trace) =>
            trace.promptChars ? [trace.promptChars.mean] : [],
          ),
        ),
      },
      diagnosticFlags: [...diagnostics]
        .map(([flag, count]) => ({ flag, samples: count }))
        .sort((a, b) => a.flag.localeCompare(b.flag)),
    };
  });

  const objectiveChecksPassed = tasks.reduce(
    (sum, task) =>
      sum + task.checks.reduce((count, check) => count + check.passed, 0),
    0,
  );
  const objectiveChecksTotal = tasks.reduce(
    (sum, task) =>
      sum + task.checks.reduce((count, check) => count + check.samples, 0),
    0,
  );
  const taskSamples = tasks.reduce((sum, task) => sum + task.sampleCount, 0);
  const executionCompletions = tasks.reduce(
    (sum, task) => sum + task.executionCompletions,
    0,
  );

  return {
    suiteId: baseline.suite.id,
    suiteVersion: baseline.suite.version,
    schemaVersion: 4,
    evaluatorVersion: baseline.evaluatorVersion,
    routeLabel: baseline.routeLabel,
    route: baseline.route,
    source: {
      revision: baseline.source.revision,
      workingTreeClean: true,
    },
    reportSamples: reports.length,
    taskSamples,
    executionCompletions,
    executionCompletionRate: executionCompletions / taskSamples,
    objectiveChecksPassed,
    objectiveChecksTotal,
    objectiveCheckPassRate: objectiveChecksPassed / objectiveChecksTotal,
    suiteWallTimeMs: distribution(
      reports.map((report) => report.summary?.suiteWallTimeMs ?? 0),
    ),
    tasks,
  };
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
    baseline.schemaVersion >= 3
      ? "timing.execDurationMs (sum of end-to-end Nub exec child invocations; includes CLI startup, provider/model, and tool time)"
      : baseline.schemaVersion === 2
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
        execToFirstAssistantTextMs:
          base.timing?.execToFirstAssistantTextMs ?? null,
      },
      candidate: {
        executionCompleted: nextCompleted,
        checksPassed: checksPassed(next),
        checksTotal: next.checks.length,
        durationMs: next.comparisonDurationMs,
        execToFirstAssistantTextMs:
          next.timing?.execToFirstAssistantTextMs ?? null,
      },
      executionCompletionDelta: Number(nextCompleted) - Number(baseCompleted),
      objectiveCheckSuccessDelta: ratioDelta(
        checksPassed(next),
        next.checks.length,
        checksPassed(base),
        base.checks.length,
      ),
      durationDeltaMs: next.comparisonDurationMs - base.comparisonDurationMs,
      execToFirstAssistantTextDeltaMs:
        typeof base.timing?.execToFirstAssistantTextMs === "number" &&
        typeof next.timing?.execToFirstAssistantTextMs === "number"
          ? next.timing.execToFirstAssistantTextMs -
            base.timing.execToFirstAssistantTextMs
          : null,
      modelUsage:
        baseline.schemaVersion >= 3
          ? {
              baseline: base.modelUsage ?? null,
              candidate: next.modelUsage ?? null,
            }
          : null,
    });
  }

  const pairedModelUsageTasks = tasks.filter((task) => {
    const usage = task.modelUsage;
    return (
      usage !== null &&
      usage !== undefined &&
      usage.baseline !== null &&
      usage.candidate !== null
    );
  });
  const aggregateModelUsage = (side: "baseline" | "candidate") => {
    const metrics = pairedModelUsageTasks.flatMap((task) => {
      const metric = task.modelUsage?.[side];
      return metric ? [metric] : [];
    });
    if (metrics.length === 0) return null;
    const firstTextSamples = metrics.reduce(
      (sum, metric) => sum + metric.firstTextSamples,
      0,
    );
    const tokenUsageSamples = metrics.reduce(
      (sum, metric) => sum + metric.tokenUsageSamples,
      0,
    );
    return {
      provider: "codex" as const,
      providerCalls: metrics.reduce(
        (sum, metric) => sum + metric.providerCalls,
        0,
      ),
      completedCalls: metrics.reduce(
        (sum, metric) => sum + metric.completedCalls,
        0,
      ),
      failedCalls: metrics.reduce((sum, metric) => sum + metric.failedCalls, 0),
      providerDurationMs: metrics.reduce(
        (sum, metric) => sum + metric.providerDurationMs,
        0,
      ),
      firstTextSamples,
      meanFirstTextMs:
        firstTextSamples > 0
          ? Math.round(
              metrics.reduce(
                (sum, metric) =>
                  sum + (metric.meanFirstTextMs ?? 0) * metric.firstTextSamples,
                0,
              ) / firstTextSamples,
            )
          : null,
      tokenUsageSamples,
      inputTokens:
        tokenUsageSamples > 0
          ? metrics.reduce((sum, metric) => sum + (metric.inputTokens ?? 0), 0)
          : null,
      outputTokens:
        tokenUsageSamples > 0
          ? metrics.reduce((sum, metric) => sum + (metric.outputTokens ?? 0), 0)
          : null,
      totalTokens:
        tokenUsageSamples > 0
          ? metrics.reduce((sum, metric) => sum + (metric.totalTokens ?? 0), 0)
          : null,
      costUsd: null as null,
    };
  };
  const providerUsage =
    baseline.schemaVersion >= 3
      ? {
          pairedTaskCount: pairedModelUsageTasks.length,
          totalTaskCount: tasks.length,
          baseline: aggregateModelUsage("baseline"),
          candidate: aggregateModelUsage("candidate"),
        }
      : undefined;

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
  const pairedFirstAssistantTextDeltas = tasks.flatMap((task) =>
    task.execToFirstAssistantTextDeltaMs === null
      ? []
      : [task.execToFirstAssistantTextDeltaMs],
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
    pairedFirstAssistantTextTaskCount: pairedFirstAssistantTextDeltas.length,
    meanExecToFirstAssistantTextDeltaMs:
      pairedFirstAssistantTextDeltas.length > 0
        ? pairedFirstAssistantTextDeltas.reduce(
            (sum, value) => sum + value,
            0,
          ) / pairedFirstAssistantTextDeltas.length
        : null,
    ...(baseline.schemaVersion === 4 && baseline.source && candidate.source
      ? { source: { baseline: baseline.source, candidate: candidate.source } }
      : {}),
    ...(providerUsage ? { providerUsage } : {}),
    tasks,
  };
}
