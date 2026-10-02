import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface HeadlessModelUsage {
  provider: "codex";
  providerCalls: number;
  completedCalls: number;
  failedCalls: number;
  providerDurationMs: number;
  firstTextSamples: number;
  /** Mean provider-call latency to first text; not end-user TTFT. */
  meanFirstTextMs: number | null;
  tokenUsageSamples: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Codex usage is not a per-invocation billable USD charge. */
  costUsd: null;
}

interface ProviderCallMetric {
  provider: "codex";
  completed: boolean;
  providerDurationMs: number;
  firstTextMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || nonNegativeInteger(value);
}

function parseProviderCallMetric(value: unknown): ProviderCallMetric | null {
  if (
    !isRecord(value) ||
    value.provider !== "codex" ||
    typeof value.completed !== "boolean" ||
    !nonNegativeInteger(value.providerDurationMs) ||
    !nullableNonNegativeInteger(value.firstTextMs) ||
    !nullableNonNegativeInteger(value.inputTokens) ||
    !nullableNonNegativeInteger(value.outputTokens) ||
    !nullableNonNegativeInteger(value.totalTokens)
  ) {
    return null;
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
    return null;
  }
  return {
    provider: "codex",
    completed: value.completed,
    providerDurationMs: value.providerDurationMs,
    firstTextMs: value.firstTextMs,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
  };
}

export function readHeadlessModelUsage(dataDir: string): {
  usage: HeadlessModelUsage | null;
  malformed: boolean;
} {
  const path = join(dataDir, "eval-model-calls.jsonl");
  if (!existsSync(path)) return { usage: null, malformed: false };

  const metrics: ProviderCallMetric[] = [];
  let malformed = false;
  let stored: string;
  try {
    stored = readFileSync(path, "utf8");
  } catch {
    return { usage: null, malformed: true };
  }
  for (const line of stored.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const metric = parseProviderCallMetric(JSON.parse(line) as unknown);
      if (!metric) {
        malformed = true;
        continue;
      }
      metrics.push(metric);
    } catch {
      malformed = true;
    }
  }
  if (metrics.length === 0) return { usage: null, malformed };

  const firstTextMetrics = metrics.flatMap((metric) =>
    metric.firstTextMs === null ? [] : [metric.firstTextMs],
  );
  const tokenMetrics = metrics.filter((metric) => metric.inputTokens !== null);
  const sumTokenField = (
    field: "inputTokens" | "outputTokens" | "totalTokens",
  ) =>
    tokenMetrics.length > 0
      ? tokenMetrics.reduce((sum, metric) => sum + (metric[field] ?? 0), 0)
      : null;

  return {
    malformed,
    usage: {
      provider: "codex",
      providerCalls: metrics.length,
      completedCalls: metrics.filter((metric) => metric.completed).length,
      failedCalls: metrics.filter((metric) => !metric.completed).length,
      providerDurationMs: metrics.reduce(
        (sum, metric) => sum + metric.providerDurationMs,
        0,
      ),
      firstTextSamples: firstTextMetrics.length,
      meanFirstTextMs:
        firstTextMetrics.length > 0
          ? Math.round(
              firstTextMetrics.reduce((sum, duration) => sum + duration, 0) /
                firstTextMetrics.length,
            )
          : null,
      tokenUsageSamples: tokenMetrics.length,
      inputTokens: sumTokenField("inputTokens"),
      outputTokens: sumTokenField("outputTokens"),
      totalTokens: sumTokenField("totalTokens"),
      costUsd: null,
    },
  };
}
