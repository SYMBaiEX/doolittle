import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const JOURNAL_PATH = join("trajectories", "trajectory-events.jsonl");
const CONTINUATION_REASONS = [
  "explicitly-incomplete-response",
  "unverified-terminal-response",
  "empty-terminal-response",
] as const;
const MAX_ACTION_LABEL_DIAGNOSTICS = 32;
const SAFE_ACTION_LABEL =
  /^(?:DOOLITTLE_[A-Z0-9_]{1,56}|TASKS_[A-Z0-9_]{1,56}|WEB_SEARCH|REPLY|IGNORE|CONTINUE|UPDATE)$/u;

export interface HeadlessTraceSummary {
  journalAvailable: boolean;
  malformed: boolean;
  modelRequests: number;
  modelResponses: number;
  modelErrors: number;
  mutationContinuations: number;
  actionStarts: number;
  actionCompletions: number;
  actionSuccesses: number;
  actionFailures: number;
  continuationReasons: Record<(typeof CONTINUATION_REASONS)[number], number>;
  maxContinuationAttempt: number | null;
  promptChars: {
    samples: number;
    min: number;
    max: number;
    mean: number;
  } | null;
}

export interface HeadlessActionLabelDiagnostic {
  labels: string[];
  omitted: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

/**
 * Returns a bounded, local-only view of action labels. Trajectory labels can
 * contain model/user text, so only known static identifier shapes are shown.
 */
export function readHeadlessActionLabelDiagnostic(
  dataDir: string,
): HeadlessActionLabelDiagnostic {
  const path = join(dataDir, JOURNAL_PATH);
  const diagnostic: HeadlessActionLabelDiagnostic = { labels: [], omitted: 0 };
  if (!existsSync(path)) return diagnostic;

  let stored: string;
  try {
    stored = readFileSync(path, "utf8");
  } catch {
    return diagnostic;
  }

  for (const line of stored.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (
        !isRecord(event) ||
        event.category !== "action" ||
        event.event !== "action.started"
      ) {
        continue;
      }

      let label = "[redacted]";
      if (
        isRecord(event.metadata) &&
        typeof event.metadata.action === "string"
      ) {
        const candidate = event.metadata.action.trim();
        if (candidate.length <= 64 && SAFE_ACTION_LABEL.test(candidate)) {
          label = candidate;
        }
      }
      if (diagnostic.labels.length < MAX_ACTION_LABEL_DIAGNOSTICS) {
        diagnostic.labels.push(label);
      } else {
        diagnostic.omitted += 1;
      }
    } catch {
      // The normal trace summary reports malformed journal data separately.
    }
  }
  return diagnostic;
}

export function hasFailedResearchAction(dataDir: string): boolean {
  const path = join(dataDir, JOURNAL_PATH);
  if (!existsSync(path)) return false;

  let stored: string;
  try {
    stored = readFileSync(path, "utf8");
  } catch {
    return false;
  }

  return stored.split(/\r?\n/u).some((line) => {
    if (!line.trim()) return false;
    try {
      const event: unknown = JSON.parse(line);
      if (
        !isRecord(event) ||
        event.category !== "action" ||
        event.event !== "action.completed"
      ) {
        return false;
      }
      if (!isRecord(event.metadata)) return false;
      return (
        event.metadata.action === "DOOLITTLE_RESEARCH" &&
        event.metadata.success === false
      );
    } catch {
      return false;
    }
  });
}

/** Returns the first model-request journal timestamp without exposing its payload. */
export function readFirstModelRequestAtMs(dataDir: string): number | null {
  const path = join(dataDir, JOURNAL_PATH);
  if (!existsSync(path)) return null;

  let stored: string;
  try {
    stored = readFileSync(path, "utf8");
  } catch {
    return null;
  }

  for (const line of stored.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (
        !isRecord(event) ||
        event.category !== "model" ||
        event.event !== "model.request"
      ) {
        continue;
      }
      if (typeof event.createdAt !== "string") return null;
      const timestampMs = Date.parse(event.createdAt);
      return Number.isFinite(timestampMs) ? timestampMs : null;
    } catch {
      // The trace summary separately reports malformed journal data.
    }
  }
  return null;
}

export function readHeadlessTraceSummary(
  dataDir: string,
): HeadlessTraceSummary {
  const path = join(dataDir, JOURNAL_PATH);
  const continuationReasons = Object.fromEntries(
    CONTINUATION_REASONS.map((reason) => [reason, 0]),
  ) as HeadlessTraceSummary["continuationReasons"];
  const summary: HeadlessTraceSummary = {
    journalAvailable: existsSync(path),
    malformed: false,
    modelRequests: 0,
    modelResponses: 0,
    modelErrors: 0,
    mutationContinuations: 0,
    actionStarts: 0,
    actionCompletions: 0,
    actionSuccesses: 0,
    actionFailures: 0,
    continuationReasons,
    maxContinuationAttempt: null,
    promptChars: null,
  };
  if (!summary.journalAvailable) return summary;

  let stored: string;
  try {
    stored = readFileSync(path, "utf8");
  } catch {
    summary.malformed = true;
    return summary;
  }

  const promptSizes: number[] = [];
  for (const line of stored.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      summary.malformed = true;
      continue;
    }
    if (!isRecord(event)) continue;

    if (event.category === "action") {
      if (event.event === "action.started") {
        summary.actionStarts += 1;
      } else if (event.event === "action.completed") {
        summary.actionCompletions += 1;
        if (isRecord(event.metadata)) {
          if (event.metadata.success === true) summary.actionSuccesses += 1;
          else if (event.metadata.success === false)
            summary.actionFailures += 1;
        }
      }
      continue;
    }

    if (event.category !== "model") continue;

    if (event.event === "model.request") {
      summary.modelRequests += 1;
      if (
        isRecord(event.metadata) &&
        nonNegativeInteger(event.metadata.promptChars)
      ) {
        promptSizes.push(event.metadata.promptChars);
      }
    } else if (event.event === "model.response") {
      summary.modelResponses += 1;
    } else if (event.event === "model.error") {
      summary.modelErrors += 1;
    } else if (event.event === "model.continuation") {
      summary.mutationContinuations += 1;
      if (!isRecord(event.metadata)) continue;
      const reason = event.metadata.reason;
      if (
        typeof reason === "string" &&
        CONTINUATION_REASONS.includes(
          reason as (typeof CONTINUATION_REASONS)[number],
        )
      ) {
        continuationReasons[reason as keyof typeof continuationReasons] += 1;
      }
      if (nonNegativeInteger(event.metadata.attempt)) {
        summary.maxContinuationAttempt = Math.max(
          summary.maxContinuationAttempt ?? 0,
          event.metadata.attempt,
        );
      }
    }
  }

  if (promptSizes.length > 0) {
    const minimum = promptSizes.reduce((current, value) =>
      Math.min(current, value),
    );
    const maximum = promptSizes.reduce((current, value) =>
      Math.max(current, value),
    );
    summary.promptChars = {
      samples: promptSizes.length,
      min: minimum,
      max: maximum,
      mean: Math.round(
        promptSizes.reduce((sum, size) => sum + size, 0) / promptSizes.length,
      ),
    };
  }
  return summary;
}
