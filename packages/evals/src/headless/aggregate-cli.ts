#!/usr/bin/env nub

import {
  aggregateHeadlessEvalReports,
  readHeadlessEvalReport,
} from "./compare";

function parseArguments(argv: string[]): { reports: string[]; json: boolean } {
  const reports: string[] = [];
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      console.log(
        "Usage: nub run eval:headless:aggregate -- --report REPORT.json --report REPORT.json [--json]\nAggregates compatible schema-v3 repeats; output excludes report contents and paths.",
      );
      process.exit(0);
    }
    if (key === "--json") {
      if (json) throw new Error("Pass --json only once.");
      json = true;
      continue;
    }
    if (key !== "--report") throw new Error("Unknown option.");
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error("Missing value for --report.");
    reports.push(value);
    index += 1;
  }
  if (reports.length < 2) throw new Error("Pass --report at least twice.");
  return { reports, json };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(value: number): string {
  return `${(value / 1000).toFixed(1)}s`;
}

function distribution(
  value: {
    count: number;
    min: number;
    median: number;
    p90: number;
    max: number;
    mean: number;
  } | null,
  format: (number: number) => string,
): string {
  if (!value) return "unavailable";
  return `n=${value.count} median=${format(value.median)} p90=${format(value.p90)} mean=${format(value.mean)} range=${format(value.min)}–${format(value.max)}`;
}

function main(): number {
  try {
    const options = parseArguments(process.argv.slice(2));
    const aggregate = aggregateHeadlessEvalReports(
      options.reports.map(readHeadlessEvalReport),
    );
    if (options.json) {
      console.log(JSON.stringify(aggregate, null, 2));
      return 0;
    }

    console.log(
      `Headless suite ${aggregate.suiteId} v${aggregate.suiteVersion} · schema v3 · evaluator ${aggregate.evaluatorVersion} · route ${aggregate.routeLabel}`,
    );
    console.log(
      `Repeats: ${aggregate.reportSamples}; task executions: ${aggregate.executionCompletions}/${aggregate.taskSamples} completed (${percent(aggregate.executionCompletionRate)}); objective checks: ${aggregate.objectiveChecksPassed}/${aggregate.objectiveChecksTotal} passed (${percent(aggregate.objectiveCheckPassRate)}).`,
    );
    console.log(
      `Suite wall time: ${distribution(aggregate.suiteWallTimeMs, seconds)}.`,
    );
    for (const task of aggregate.tasks) {
      const checkSummary = task.checks
        .map(
          (check) =>
            `${check.id} ${check.passed}/${check.samples} (${percent(check.passRate)})`,
        )
        .join("; ");
      console.log(
        `  ${task.taskId} [${task.domain}] · completed ${task.executionCompletions}/${task.sampleCount} (${percent(task.executionCompletionRate)}); checks ${checkSummary}.`,
      );
      console.log(
        `    Exec child duration: ${distribution(task.execDurationMs, seconds)}; exec invocations: ${distribution(task.execInvocations, (number) => number.toFixed(1))}.`,
      );
      console.log(
        `    Codex telemetry (${task.providerMetrics.sampleCount}/${task.sampleCount} task samples): calls ${distribution(task.providerMetrics.providerCalls, (number) => number.toFixed(1))}; summed provider-call time ${distribution(task.providerMetrics.providerDurationMs, seconds)}; total tokens ${distribution(task.providerMetrics.totalTokens, (number) => Math.round(number).toLocaleString())}.`,
      );
      if (task.diagnosticFlags.length > 0) {
        console.log(
          `    Diagnostics: ${task.diagnosticFlags.map(({ flag, samples }) => `${flag} ${samples}/${task.sampleCount}`).join(", ")}.`,
        );
      }
    }
    console.log(
      "Descriptive repeat statistics only: deterministic checks are not human quality ratings or causal model comparisons. Exec child duration includes harness overhead; summed provider-call time is not wall time or end-user TTFT. USD cost is unavailable.",
    );
    return 0;
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(Unknown option|Missing value|Pass --report|Pass --json)/.test(
        error.message,
      )
        ? error.message
        : "Unable to aggregate reports: provide at least two compatible schema-v3 reports.";
    console.error(message);
    return 1;
  }
}

process.exitCode = main();
