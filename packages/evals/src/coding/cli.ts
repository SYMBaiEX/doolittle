#!/usr/bin/env nub

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  CODING_EVAL_CASES,
  CODING_EVAL_SUITES,
  type CodingEvalCase,
  type CodingEvalSuite,
  type CodingEvalSuiteId,
  findCodingEvalTask,
} from "./cases";
import { evaluateCodingRun } from "./evaluator";
import { createCodingEvalReport, writeCodingEvalReport } from "./report";

interface RunEnvelope {
  run?: Record<string, unknown>;
}

interface CodingEvalInvocation {
  runId: string;
  taskId?: string;
  evalCase: CodingEvalCase;
}

interface CodingEvalOptions {
  gateway: string;
  journal: string;
  workspace: string;
  invocations: CodingEvalInvocation[];
  suite?: CodingEvalSuite;
  suiteId?: string;
  fixtureId?: string;
  routeLabel?: string;
  reportDirectory?: string;
  writeReport: boolean;
}

function parseArguments(argv: string[]): CodingEvalOptions {
  const values = new Map<string, string[]>();
  let writeReport = true;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      console.log(
        [
          "Usage: nub run eval:coding -- --gateway URL --journal PATH --workspace PATH [--case ID --run ID ...]",
          "       nub run eval:coding -- --gateway URL --journal PATH --workspace PATH --suite coding-harness-v1 --fixture ID --task-run TASK_ID=RUN_ID ...",
          "Cases: coding-change-v1, coding-app-handoff-v1, coding-bun-app-handoff-v1, app-start-v1, api-runtime-fix-v1, verified-noop-v1",
          "Suites: coding-harness-v1 (fixed Next.js + shadcn + Bun app-handoff task)",
          "Reports are saved privately under the Doolittle eval state directory by default; pass --report-dir to change it or --no-report to skip.",
          "Suite reports require the stable starting-project fixture ID; compare them with `nub run eval:compare -- --baseline PATH --candidate PATH`.",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (key === "--no-report") {
      writeReport = false;
      continue;
    }
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key ?? "(empty)"}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key, [...(values.get(key) ?? []), value]);
    index += 1;
  }

  const first = (name: string) => values.get(name)?.[0];
  const gateway = first("--gateway");
  const journal = first("--journal");
  const workspace = first("--workspace");
  const caseId = first("--case");
  const suiteId = first("--suite");
  const fixtureId = first("--fixture");
  const routeLabel = first("--route-label");
  const reportDirectory = first("--report-dir");
  if (!gateway || !journal || !workspace) {
    throw new Error("--gateway, --journal, and --workspace are required.");
  }
  const runIds = values.get("--run") ?? [];
  const taskRuns = values.get("--task-run") ?? [];
  const invocations: CodingEvalInvocation[] = [];
  let suite: CodingEvalSuite | undefined;

  if (suiteId) {
    if (caseId || runIds.length > 0) {
      throw new Error(
        "Use --suite with --task-run, or --case with --run, not both.",
      );
    }
    suite = CODING_EVAL_SUITES[suiteId as CodingEvalSuiteId];
    if (!suite) {
      throw new Error(
        `Unknown coding eval suite: ${suiteId}. Available suites: ${Object.keys(CODING_EVAL_SUITES).join(", ")}`,
      );
    }
    if (!fixtureId) {
      throw new Error("--fixture is required for a comparable suite report.");
    }
    if (taskRuns.length !== suite.tasks.length) {
      throw new Error(
        `Suite ${suiteId} requires exactly ${suite.tasks.length} --task-run mapping(s).`,
      );
    }
    for (const mapping of taskRuns) {
      const separator = mapping.indexOf("=");
      if (separator <= 0 || separator === mapping.length - 1) {
        throw new Error(
          `Invalid --task-run ${mapping}; expected TASK_ID=RUN_ID.`,
        );
      }
      const taskId = mapping.slice(0, separator);
      const runId = mapping.slice(separator + 1);
      const task = findCodingEvalTask(suiteId, taskId);
      if (!task) throw new Error(`Unknown task ${taskId} in suite ${suiteId}.`);
      invocations.push({
        runId,
        taskId,
        evalCase: CODING_EVAL_CASES[task.caseId],
      });
    }
    const mappedTaskIds = new Set(invocations.map((entry) => entry.taskId));
    if (
      mappedTaskIds.size !== suite.tasks.length ||
      suite.tasks.some((task) => !mappedTaskIds.has(task.id))
    ) {
      throw new Error(`Map every task in suite ${suiteId} exactly once.`);
    }
  } else {
    if (taskRuns.length > 0) {
      throw new Error("--task-run requires --suite.");
    }
    const selectedCaseId = caseId ?? "coding-change-v1";
    const evalCase =
      CODING_EVAL_CASES[selectedCaseId as keyof typeof CODING_EVAL_CASES];
    if (!evalCase) {
      throw new Error(
        `Unknown coding eval case: ${selectedCaseId}. Available cases: ${Object.keys(CODING_EVAL_CASES).join(", ")}`,
      );
    }
    if (runIds.length === 0) {
      throw new Error(
        "At least one explicit --run ID or --task-run mapping is required.",
      );
    }
    for (const runId of runIds) invocations.push({ runId, evalCase });
  }

  if (
    new Set(invocations.map((entry) => entry.runId)).size !== invocations.length
  ) {
    throw new Error("Run IDs must be unique within an evaluation.");
  }
  return {
    gateway: new URL(gateway).origin,
    journal,
    workspace,
    invocations,
    ...(suite ? { suite } : {}),
    ...(suiteId ? { suiteId } : {}),
    ...(fixtureId ? { fixtureId } : {}),
    ...(routeLabel ? { routeLabel } : {}),
    ...(reportDirectory ? { reportDirectory } : {}),
    writeReport,
  };
}

async function readSelectedEvents(
  path: string,
  selectedRunIds: Set<string>,
): Promise<Map<string, unknown[]>> {
  const events = new Map<string, unknown[]>();
  for (const runId of selectedRunIds) events.set(runId, []);
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const runId = event.runId;
    if (typeof runId === "string" && selectedRunIds.has(runId)) {
      events.get(runId)?.push(event);
    }
  }
  return events;
}

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(
      `Gateway returned HTTP ${response.status} for ${url.pathname}`,
    );
  }
  return (await response.json()) as T;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[middle];
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined
    ? undefined
    : Math.round((lower + upper) / 2);
}

function elapsedMs(start: unknown, end: unknown): number | undefined {
  if (typeof start !== "string" || typeof end !== "string") return undefined;
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined;
}

function formatDuration(milliseconds: number | undefined): string {
  return milliseconds === undefined
    ? "n/a"
    : `${(milliseconds / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const executions = await Promise.all(
    options.invocations.map(async (invocation) => {
      const envelope = await getJson<RunEnvelope>(
        new URL(
          `/chat/runs/${encodeURIComponent(invocation.runId)}`,
          options.gateway,
        ),
      );
      if (!envelope.run)
        throw new Error(`Run receipt is missing for ${invocation.runId}.`);
      if (envelope.run.runId !== invocation.runId) {
        throw new Error(
          `Gateway returned a different run receipt for ${invocation.runId}.`,
        );
      }
      return { ...invocation, run: envelope.run };
    }),
  );
  const selectedRunIds = new Set(
    executions.map(({ run }) => String(run.runId)),
  );
  const eventsByRun = await readSelectedEvents(options.journal, selectedRunIds);
  const results = executions.map((execution) => ({
    ...execution,
    evaluation: evaluateCodingRun({
      run: execution.run,
      events: eventsByRun.get(String(execution.run.runId)) ?? [],
      expectedWorkspace: options.workspace,
      evalCase: execution.evalCase,
    }),
  }));

  const totals = results.reduce(
    (summary, result) => {
      summary[result.evaluation.status] += 1;
      summary.score += result.evaluation.score;
      summary.maxScore += result.evaluation.maxScore;
      return summary;
    },
    { pass: 0, fail: 0, incomplete: 0, score: 0, maxScore: 0 },
  );
  console.log(
    `Coding eval ${options.suite?.title ?? results[0]?.evalCase.title}: ${results.length} run(s), ${totals.pass} pass, ${totals.fail} fail, ${totals.incomplete} incomplete; ${totals.score}/${totals.maxScore} evidence points.`,
  );
  const durations = executions.flatMap(({ run }) => {
    const duration = elapsedMs(run.startedAt, run.endedAt ?? run.updatedAt);
    return duration === undefined ? [] : [duration];
  });
  const firstActionLatencies = executions.flatMap(({ run }) => {
    const latency = elapsedMs(run.startedAt, run.firstActionAt);
    return latency === undefined ? [] : [latency];
  });
  const actionCounts = executions.flatMap(({ run }) =>
    typeof run.observedActionCount === "number"
      ? [run.observedActionCount]
      : [],
  );
  const recoveredBuilds = results.filter((result) =>
    result.evaluation.checks
      .find((entry) => entry.id === "build")
      ?.evidence.some((entry) => entry.startsWith("Recovered after ")),
  ).length;
  console.log(
    `Separate effort metrics (medians): wall ${formatDuration(median(durations))}, first action ${formatDuration(median(firstActionLatencies))}, observed actions ${median(actionCounts) ?? "n/a"}; recovered builds ${recoveredBuilds}.`,
  );
  for (const { evaluation: result, taskId } of results) {
    console.log(
      `\n${result.status.toUpperCase()} ${taskId ? `${taskId} · ` : ""}${result.runId} · ${result.caseId} (${result.score}/${result.maxScore})`,
    );
    for (const entry of result.checks) {
      if (entry.status === "n/a") continue;
      console.log(
        `  ${entry.status.toUpperCase()} ${entry.id}: ${entry.evidence[0]}`,
      );
    }
  }

  if (options.writeReport) {
    const report = createCodingEvalReport({
      workspace: options.workspace,
      runs: results.map(({ run, evaluation, taskId }) => ({
        run,
        evaluation,
        ...(taskId ? { taskId } : {}),
      })),
      ...(options.suite ? { suite: options.suite } : {}),
      ...(options.suiteId ? { taskSetId: options.suiteId } : {}),
      ...(options.fixtureId ? { fixtureId: options.fixtureId } : {}),
      ...(options.routeLabel ? { routeLabel: options.routeLabel } : {}),
    });
    const path = writeCodingEvalReport(report, options.reportDirectory);
    console.log(
      `Saved ${report.comparisonReady ? "comparison-ready" : "ad hoc"} private report: ${path}`,
    );
  }

  if (totals.fail > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
