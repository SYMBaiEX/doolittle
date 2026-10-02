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

function count(value: number | null): string {
  return value === null ? "unavailable" : value.toLocaleString();
}

function seconds(value: number): string {
  return `${(value / 1000).toFixed(1)}s`;
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
    if (comparison.source) {
      const baseline = comparison.source.baseline;
      const candidate = comparison.source.candidate;
      console.log(
        `Source commits: ${baseline.revision?.slice(0, 12) ?? "unavailable"} (${baseline.workingTreeClean === true ? "clean" : baseline.workingTreeClean === false ? "dirty" : "unknown"}) → ${candidate.revision?.slice(0, 12) ?? "unavailable"} (${candidate.workingTreeClean === true ? "clean" : candidate.workingTreeClean === false ? "dirty" : "unknown"}).`,
      );
    }
    console.log(
      `Execution completion: ${comparison.baseline.executionCompletions}/${comparison.baseline.taskTotal} → ${comparison.candidate.executionCompletions}/${comparison.candidate.taskTotal} (${percent(comparison.executionCompletionDelta)}).`,
    );
    console.log(
      `Objective checks: ${comparison.baseline.checkSuccesses}/${comparison.baseline.checkTotal} → ${comparison.candidate.checkSuccesses}/${comparison.candidate.checkTotal} (${percent(comparison.objectiveCheckSuccessDelta)}).`,
    );
    console.log(
      `Mean paired duration delta (candidate − baseline), metric ${comparison.durationMetric}: ${signedMs(comparison.meanDurationDeltaMs)}; negative is faster.`,
    );
    console.log(
      `Exec-to-first-assistant-text mean paired delta (${comparison.pairedFirstAssistantTextTaskCount}/${comparison.sampleSize} tasks): ${comparison.meanExecToFirstAssistantTextDeltaMs === null ? "unavailable" : signedMs(comparison.meanExecToFirstAssistantTextDeltaMs)}; includes CLI startup and streamed output, not model-only or rendered UI latency.`,
    );
    console.log(
      `Exec-to-first-model-request mean paired delta (${comparison.pairedFirstModelRequestTaskCount}/${comparison.sampleSize} tasks): ${comparison.meanExecToFirstModelRequestDeltaMs === null ? "unavailable" : signedMs(comparison.meanExecToFirstModelRequestDeltaMs)}; a startup/prompt-preparation signal, not pure harness overhead.`,
    );
    for (const task of comparison.tasks) {
      console.log(
        `  ${task.taskId} [${task.domain}] · execution ${task.baseline.executionCompleted ? "completed" : "failed"} → ${task.candidate.executionCompleted ? "completed" : "failed"} (${task.executionCompletionDelta > 0 ? "+1" : task.executionCompletionDelta < 0 ? "-1" : "0"}); checks ${task.baseline.checksPassed}/${task.baseline.checksTotal} → ${task.candidate.checksPassed}/${task.candidate.checksTotal} (${percent(task.objectiveCheckSuccessDelta)}); ${comparison.durationMetric}: ${task.baseline.durationMs} → ${task.candidate.durationMs} ms (${signedMs(task.durationDeltaMs)}); exec-to-model-request ${task.baseline.execToFirstModelRequestMs ?? "unavailable"} → ${task.candidate.execToFirstModelRequestMs ?? "unavailable"} ms (${task.execToFirstModelRequestDeltaMs === null ? "unavailable" : signedMs(task.execToFirstModelRequestDeltaMs)}); exec-to-first-text ${task.baseline.execToFirstAssistantTextMs ?? "unavailable"} → ${task.candidate.execToFirstAssistantTextMs ?? "unavailable"} ms (${task.execToFirstAssistantTextDeltaMs === null ? "unavailable" : signedMs(task.execToFirstAssistantTextDeltaMs)}).`,
      );
    }
    if (comparison.providerUsage) {
      const usage = comparison.providerUsage;
      if (usage.pairedTaskCount === 0) {
        console.log(
          `Codex provider metrics: unavailable for paired tasks (0/${usage.totalTaskCount}).`,
        );
      } else {
        const baseline = usage.baseline;
        const candidate = usage.candidate;
        if (baseline && candidate) {
          console.log(
            `Codex metrics (${usage.pairedTaskCount}/${usage.totalTaskCount} paired tasks): provider-call time sum ${seconds(baseline.providerDurationMs)} → ${seconds(candidate.providerDurationMs)}; calls ${baseline.providerCalls} → ${candidate.providerCalls}.`,
          );
          console.log(
            `  Provider-call mean first text ${baseline.meanFirstTextMs === null ? "unavailable" : `${baseline.meanFirstTextMs}ms`} → ${candidate.meanFirstTextMs === null ? "unavailable" : `${candidate.meanFirstTextMs}ms`} (not user-facing TTFT); input/output/total tokens ${count(baseline.inputTokens)}/${count(baseline.outputTokens)}/${count(baseline.totalTokens)} → ${count(candidate.inputTokens)}/${count(candidate.outputTokens)}/${count(candidate.totalTokens)} (${baseline.tokenUsageSamples} → ${candidate.tokenUsageSamples} calls with reported usage). USD cost is not reported by this Codex route.`,
          );
        }
      }
    }
    const timingDisclaimer =
      comparison.schemaVersion >= 2
        ? `Schema-v${comparison.schemaVersion} duration is end-to-end Doolittle exec child time, not model-only latency; setup and grading are separate.`
        : "Schema-v1 elapsedMs spans child execution through response parsing and grading; it is not model-only latency.";
    const telemetryDisclaimer =
      comparison.schemaVersion >= 3
        ? "Provider metrics are Codex-reported; summed call durations are not wall time, first text is per-call (not end-user TTFT), and USD cost is unavailable."
        : "Provider, token, first-text, cost, harness, and environment effects are not separated.";
    console.log(
      `These deterministic checks do not establish human-facing quality or causal model improvement. ${timingDisclaimer} ${telemetryDisclaimer}`,
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
