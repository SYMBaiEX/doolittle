#!/usr/bin/env nub

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  CODING_EVAL_CASES,
  evaluateCodingRun,
} from "./acceptance/coding-run-eval";

interface RunEnvelope {
  run?: Record<string, unknown>;
}

function parseArguments(argv: string[]): {
  gateway: string;
  journal: string;
  workspace: string;
  runIds: string[];
  caseId: string;
} {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      console.log(
        [
          "Usage: nub scripts/evaluate-coding-runs.ts --gateway URL --journal PATH --workspace PATH [--case ID] [--run ID ...]",
          "Cases: coding-change-v1, coding-app-handoff-v1, app-start-v1, api-runtime-fix-v1, verified-noop-v1",
          "Repeat --run to compare multiple receipts. Explicit run IDs prevent cross-project scoring.",
        ].join("\n"),
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
    values.set(key, [...(values.get(key) ?? []), value]);
    index += 1;
  }

  const first = (name: string) => values.get(name)?.[0];
  const gateway = first("--gateway");
  const journal = first("--journal");
  const workspace = first("--workspace");
  const caseId = first("--case") ?? "coding-change-v1";
  if (!gateway || !journal || !workspace) {
    throw new Error("--gateway, --journal, and --workspace are required.");
  }
  const runIds = values.get("--run") ?? [];
  if (runIds.length === 0) {
    throw new Error("At least one explicit --run ID is required.");
  }
  if (!CODING_EVAL_CASES[caseId]) {
    throw new Error(
      `Unknown coding eval case: ${caseId}. Available cases: ${Object.keys(CODING_EVAL_CASES).join(", ")}`,
    );
  }
  return {
    gateway: new URL(gateway).origin,
    journal,
    workspace,
    runIds,
    caseId,
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
  const receipts = await Promise.all(
    options.runIds.map(async (runId) => {
      const envelope = await getJson<RunEnvelope>(
        new URL(`/chat/runs/${encodeURIComponent(runId)}`, options.gateway),
      );
      if (!envelope.run)
        throw new Error(`Run receipt is missing for ${runId}.`);
      return envelope.run;
    }),
  );
  const selectedRunIds = new Set(
    receipts.flatMap((run) =>
      typeof run.runId === "string" ? [run.runId] : [],
    ),
  );
  const eventsByRun = await readSelectedEvents(options.journal, selectedRunIds);
  const evalCase = CODING_EVAL_CASES[options.caseId];
  const evaluations = receipts.map((run) =>
    evaluateCodingRun({
      run,
      events: eventsByRun.get(String(run.runId)) ?? [],
      expectedWorkspace: options.workspace,
      evalCase,
    }),
  );

  const totals = evaluations.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      summary.score += result.score;
      summary.maxScore += result.maxScore;
      return summary;
    },
    { pass: 0, fail: 0, incomplete: 0, score: 0, maxScore: 0 },
  );
  console.log(
    `Coding eval ${evalCase.id}: ${evaluations.length} run(s), ${totals.pass} pass, ${totals.fail} fail, ${totals.incomplete} incomplete; ${totals.score}/${totals.maxScore} evidence points.`,
  );
  const durations = receipts.flatMap((run) => {
    const duration = elapsedMs(run.startedAt, run.endedAt ?? run.updatedAt);
    return duration === undefined ? [] : [duration];
  });
  const firstActionLatencies = receipts.flatMap((run) => {
    const latency = elapsedMs(run.startedAt, run.firstActionAt);
    return latency === undefined ? [] : [latency];
  });
  const actionCounts = receipts.flatMap((run) =>
    typeof run.observedActionCount === "number"
      ? [run.observedActionCount]
      : [],
  );
  const recoveredBuilds = evaluations.filter((result) =>
    result.checks
      .find((entry) => entry.id === "build")
      ?.evidence.some((entry) => entry.startsWith("Recovered after ")),
  ).length;
  console.log(
    `Separate effort metrics (medians): wall ${formatDuration(median(durations))}, first action ${formatDuration(median(firstActionLatencies))}, observed actions ${median(actionCounts) ?? "n/a"}; recovered builds ${recoveredBuilds}.`,
  );
  for (const result of evaluations) {
    console.log(
      `\n${result.status.toUpperCase()} ${result.runId} (${result.score}/${result.maxScore})`,
    );
    for (const entry of result.checks) {
      if (entry.status === "n/a") continue;
      console.log(
        `  ${entry.status.toUpperCase()} ${entry.id}: ${entry.evidence[0]}`,
      );
    }
  }
  if (totals.fail > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
