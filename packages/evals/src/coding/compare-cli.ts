#!/usr/bin/env nub

import { compareCodingEvalReports, readCodingEvalReport } from "./report";

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      console.log(
        "Usage: nub run eval:compare -- --baseline REPORT.json --candidate REPORT.json\nCompares only matching suite versions, task sets, fixtures, task IDs, and acceptance cases.",
      );
      process.exit(0);
    }
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key ?? "(empty)"}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    if (values.has(key)) throw new Error(`Pass ${key} only once.`);
    values.set(key, value);
    index += 1;
  }
  const baseline = values.get("--baseline");
  const candidate = values.get("--candidate");
  if (!baseline || !candidate) {
    throw new Error("--baseline and --candidate report paths are required.");
  }
  return { baseline, candidate };
}

function signed(value: number | null, suffix = "") {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const baseline = readCodingEvalReport(options.baseline);
  const candidate = readCodingEvalReport(options.candidate);
  const comparison = compareCodingEvalReports(baseline, candidate);

  console.log(
    `${comparison.suiteId}@${comparison.suiteVersion} · ${comparison.taskSetId} · fixture ${comparison.fixtureId}`,
  );
  console.log(
    `Baseline ${comparison.baseline.routeLabel ?? "(route unspecified)"}: ${comparison.baseline.pass}/${comparison.baseline.totalRuns} passed; mean score ${comparison.baseline.meanScorePercent ?? "n/a"}%; pass rate ${comparison.baseline.passRatePercent ?? "n/a"}%.`,
  );
  console.log(
    `Candidate ${comparison.candidate.routeLabel ?? "(route unspecified)"}: ${comparison.candidate.pass}/${comparison.candidate.totalRuns} passed; mean score ${comparison.candidate.meanScorePercent ?? "n/a"}%; pass rate ${comparison.candidate.passRatePercent ?? "n/a"}%.`,
  );
  console.log(
    `Quality deltas: mean score ${signed(comparison.meanScoreDeltaPercent, " pp")}; acceptance pass rate ${signed(comparison.passRateDeltaPercent, " pp")}.`,
  );
  console.log(
    `Effort deltas (candidate - baseline; negative is lower): wall ${signed(comparison.medianDurationDeltaMs, " ms")}, first action ${signed(comparison.medianFirstActionDeltaMs, " ms")}, actions ${signed(comparison.medianObservedActionCountDelta)}; recovered builds ${comparison.baseline.effort.recoveredBuildRuns} → ${comparison.candidate.effort.recoveredBuildRuns}.`,
  );
  for (const task of comparison.tasks) {
    console.log(
      `  ${task.taskId} · ${task.caseId}: ${task.baseline.status} ${task.baseline.score}/${task.baseline.maxScore} → ${task.candidate.status} ${task.candidate.score}/${task.candidate.maxScore} (${signed(task.scoreDeltaPercent, " pp")}).`,
    );
  }
  console.log(
    "Route labels are descriptive only. This report does not establish that a route change caused the observed delta.",
  );
}

main();
