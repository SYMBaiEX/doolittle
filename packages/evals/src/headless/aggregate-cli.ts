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
        "Usage: nub run eval:headless:aggregate -- --report REPORT.json --report REPORT.json [--json]\nAggregates same-schema v4/v5 repeats from the same clean source revision; v4 routes are legacy/unattested, v5 contains requested-only evidence. Output excludes report contents and paths.",
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

    const declaredModel =
      "modelSha256" in aggregate.route
        ? `sha256:${aggregate.route.modelSha256}`
        : aggregate.route.model;
    console.log(
      `Headless suite ${aggregate.suiteId} v${aggregate.suiteVersion} · schema v${aggregate.schemaVersion} · evaluator ${aggregate.evaluatorVersion} · route label ${aggregate.routeLabel} · ${aggregate.routeAttestation} · declared route ${aggregate.route.provider ?? "unknown"}/${declaredModel} (${aggregate.route.reasoningEffort ?? "unknown"}) · source ${aggregate.source.revision.slice(0, 12)} (clean); effective model/effort and worker route unavailable`,
    );
    console.log(
      `Repeats: ${aggregate.reportSamples}; task executions: ${aggregate.executionCompletions}/${aggregate.taskSamples} completed (${percent(aggregate.executionCompletionRate)}); objective checks: ${aggregate.objectiveChecksPassed}/${aggregate.objectiveChecksTotal} passed (${percent(aggregate.objectiveCheckPassRate)}).`,
    );
    console.log(
      `Suite wall time: ${distribution(aggregate.suiteWallTimeMs, seconds)}.`,
    );
    if (aggregate.harnessMetrics)
      console.log(
        `Direct harness phase coverage only: preflight ${distribution(aggregate.harnessMetrics.preflightMs, seconds)}; report preparation ${distribution(aggregate.harnessMetrics.reportPreparationMs, seconds)}; final cleanup ${distribution(aggregate.harnessMetrics.finalCleanupMs, seconds)}. Completed serialization/persistence are available only in separate private measurement receipts; receipt-write and inter-phase bookkeeping untimed.`,
      );
    for (const task of aggregate.tasks) {
      if (task.harnessMetrics)
        console.log(
          `    Harness phases: setup ${distribution(task.harnessMetrics.setupMs, seconds)}; response processing ${distribution(task.harnessMetrics.responseProcessingMs, seconds)}; grading ${distribution(task.harnessMetrics.gradingMs, seconds)}; task cleanup ${distribution(task.harnessMetrics.cleanupMs, seconds)}.`,
        );
      if (task.routeEvidenceCoverage)
        console.log(
          `    Requested parent-route coverage: ${task.routeEvidenceCoverage.requestedRuns}/${task.sampleCount} runs; unavailable ${task.routeEvidenceCoverage.unavailableRuns}; partial ${task.routeEvidenceCoverage.partialRuns}; effective and worker route unavailable.`,
        );
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
        `    Exec child duration: ${distribution(task.execDurationMs, seconds)}; exec to first model request: ${distribution(task.execToFirstModelRequestMs, seconds)}; exec to first assistant text: ${distribution(task.execToFirstAssistantTextMs, seconds)}; exec invocations: ${distribution(task.execInvocations, (number) => number.toFixed(1))}.`,
      );
      console.log(
        `    Codex telemetry (${task.providerMetrics.sampleCount}/${task.sampleCount} task samples): calls ${distribution(task.providerMetrics.providerCalls, (number) => number.toFixed(1))}; summed provider-call time ${distribution(task.providerMetrics.providerDurationMs, seconds)}; total tokens ${distribution(task.providerMetrics.totalTokens, (number) => Math.round(number).toLocaleString())}.`,
      );
      console.log(
        `    Trace (${task.traceMetrics.sampleCount}/${task.sampleCount} task samples): model requests ${distribution(task.traceMetrics.modelRequests, (number) => number.toFixed(1))}; responses ${distribution(task.traceMetrics.modelResponses, (number) => number.toFixed(1))}; errors ${distribution(task.traceMetrics.modelErrors, (number) => number.toFixed(1))}; mutation continuations ${distribution(task.traceMetrics.mutationContinuations, (number) => number.toFixed(1))}; mean prompt size ${distribution(task.traceMetrics.meanPromptChars, (number) => `${Math.round(number)} chars`)}.`,
      );
      console.log(
        `    Agent actions (${task.traceMetrics.sampleCount}/${task.sampleCount} task samples): started ${distribution(task.traceMetrics.actionStarts, (number) => number.toFixed(1))}; completed ${distribution(task.traceMetrics.actionCompletions, (number) => number.toFixed(1))}; succeeded ${distribution(task.traceMetrics.actionSuccesses, (number) => number.toFixed(1))}; failed ${distribution(task.traceMetrics.actionFailures, (number) => number.toFixed(1))}.`,
      );
      if (task.diagnosticFlags.length > 0) {
        console.log(
          `    Diagnostics: ${task.diagnosticFlags.map(({ flag, samples }) => `${flag} ${samples}/${task.sampleCount}`).join(", ")}.`,
        );
      }
      const researchProviderFailures = task.diagnosticFlags.filter(({ flag }) =>
        flag.startsWith("research-provider-"),
      );
      if (researchProviderFailures.length > 0) {
        console.log(
          "    Research-provider diagnostics indicate unavailable research capability; do not interpret its objective checks as a research-quality score.",
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
        : "Unable to aggregate reports: provide at least two compatible schema-v4 reports from one clean source revision.";
    console.error(message);
    return 1;
  }
}

process.exitCode = main();
