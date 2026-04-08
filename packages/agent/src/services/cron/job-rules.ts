import {
  computeNextCronRunAtMs,
  normalizeTriggerIntervalMs,
} from "@elizaos/autonomous/triggers/scheduling";
import type { CronJobRuntimeOverrides } from "@/types";

function parseDuration(value: string): number | undefined {
  const match = value.match(/^(\d+)(m|h|d)$/u);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") {
    return amount * 60 * 1000;
  }
  if (unit === "h") {
    return amount * 60 * 60 * 1000;
  }
  return amount * 24 * 60 * 60 * 1000;
}

function computeNextCronOccurrence(
  expression: string,
  from: Date,
  timezone: string,
): Date {
  const nextRunAtMs = computeNextCronRunAtMs(
    expression,
    from.getTime(),
    timezone,
  );
  if (nextRunAtMs !== null) {
    return new Date(nextRunAtMs);
  }

  throw new Error(
    `Could not compute next run for cron expression "${expression}".`,
  );
}

export function isEverySchedule(schedule: string): boolean {
  return schedule.trim().startsWith("every ");
}

export function normalizeRuntimeOverrides(
  runtime?: CronJobRuntimeOverrides,
): CronJobRuntimeOverrides | undefined {
  if (!runtime) {
    return undefined;
  }

  const normalized: CronJobRuntimeOverrides = {};
  if (runtime.provider?.trim()) {
    normalized.provider = runtime.provider.trim();
  }
  if (runtime.model?.trim()) {
    normalized.model = runtime.model.trim();
  }
  if (runtime.baseUrl?.trim()) {
    normalized.baseUrl = runtime.baseUrl.trim();
  }
  if (
    typeof runtime.temperature === "number" &&
    !Number.isNaN(runtime.temperature)
  ) {
    normalized.temperature = runtime.temperature;
  }
  if (
    typeof runtime.maxTokens === "number" &&
    Number.isFinite(runtime.maxTokens)
  ) {
    normalized.maxTokens = Math.max(1, Math.trunc(runtime.maxTokens));
  }
  if (runtime.personalityId?.trim()) {
    normalized.personalityId = runtime.personalityId.trim();
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

export function computeNextRunAt(
  schedule: string,
  from: Date,
  timezone: string,
): Date {
  const trimmed = schedule.trim().toLowerCase();
  const duration = parseDuration(trimmed.replace(/^every\s+/u, ""));

  if (trimmed.startsWith("every ") && duration) {
    return new Date(from.getTime() + normalizeTriggerIntervalMs(duration));
  }

  if (duration) {
    return new Date(from.getTime() + normalizeTriggerIntervalMs(duration));
  }

  const cronMatch = schedule.trim().split(/\s+/u);
  if (cronMatch.length === 5) {
    return computeNextCronOccurrence(schedule.trim(), from, timezone);
  }

  throw new Error(
    `Unsupported schedule "${schedule}". Use "every 30m", "2h", or a 5-field cron expression.`,
  );
}
