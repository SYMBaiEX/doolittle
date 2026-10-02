#!/usr/bin/env nub

import { compareHeadlessEvalReports, readHeadlessEvalReport } from "./compare";

function parseArguments(argv: string[]): {
  baseline: string;
  candidate: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      console.log(
        "Usage: nub run eval:headless:compare -- --baseline REPORT.json --candidate REPORT.json\nCompares paired tasks from compatible headless reports; output excludes report contents and paths.",
      );
      process.exit(0);
    }
    if (key !== "--baseline" && key !== "--candidate")
      throw new Error("Unknown option.");
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${key}.`);
    if (values.has(key)) throw new Error(`Pass ${key} only once.`);
    values.set(key, value);
    index += 1;
  }
  const baseline = values.get("--baseline");
  const candidate = values.get("--candidate");
  if (!baseline || !candidate)
    throw new Error("Both report arguments are required.");
  return { baseline, candidate };
}

function percent(value: number): string {
  const rounded = (value * 100).toFixed(1);
  return `${value > 0 ? "+" : ""}${rounded} pp`;
}

function signedMs(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(0)} ms`;
}

function main(): number {
  try {
    const options = parseArguments(process.argv.slice(2));
    const comparison = compareHeadlessEvalReports(
      readHeadlessEvalReport(options.baseline),
      readHeadlessEvalReport(options.candidate),
    );
    console.log(
      `Headless suite ${comparison.suiteId} v${comparison.suiteVersion} · schema v${comparison.schemaVersion} · evaluator ${comparison.evaluatorVersion}`,
    );
    console.log(
      `Paired sample: ${comparison.sampleSize} task(s); ${comparison.baseline.checkTotal} objective check(s).`,
    );
    console.log(
      `Execution completion: ${comparison.baseline.executionCompletions}/${comparison.baseline.taskTotal} → ${comparison.candidate.executionCompletions}/${comparison.candidate.taskTotal} (${percent(comparison.executionCompletionDelta)}).`,
    );
    console.log(
      `Objective checks: ${comparison.baseline.checkSuccesses}/${comparison.baseline.checkTotal} → ${comparison.candidate.checkSuccesses}/${comparison.candidate.checkTotal} (${percent(comparison.objectiveCheckSuccessDelta)}).`,
    );
    console.log(
      `Mean paired duration delta (candidate − baseline), metric ${comparison.durationMetric}: ${signedMs(comparison.meanDurationDeltaMs)}; negative is faster.`,
    );
    for (const task of comparison.tasks) {
      console.log(
        `  ${task.taskId} [${task.domain}] · execution ${task.baseline.executionCompleted ? "completed" : "failed"} → ${task.candidate.executionCompleted ? "completed" : "failed"} (${task.executionCompletionDelta > 0 ? "+1" : task.executionCompletionDelta < 0 ? "-1" : "0"}); checks ${task.baseline.checksPassed}/${task.baseline.checksTotal} → ${task.candidate.checksPassed}/${task.candidate.checksTotal} (${percent(task.objectiveCheckSuccessDelta)}); ${comparison.durationMetric}: ${task.baseline.durationMs} → ${task.candidate.durationMs} ms (${signedMs(task.durationDeltaMs)}).`,
      );
    }
    const timingDisclaimer =
      comparison.schemaVersion === 2
        ? "Schema-v2 duration is end-to-end Doolittle exec child time, not model-only latency; setup and grading are separate."
        : "Schema-v1 elapsedMs spans child execution through response parsing and grading; it is not model-only latency.";
    console.log(
      `These deterministic checks do not establish human-facing quality or causal model improvement. ${timingDisclaimer} Provider, harness, and environment effects are not separated.`,
    );
    return 0;
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(Unknown option|Missing value|Pass --|Both report arguments)/.test(
        error.message,
      )
        ? error.message
        : "Unable to compare reports: they are malformed or incompatible.";
    console.error(message);
    return 1;
  }
}

process.exitCode = main();
