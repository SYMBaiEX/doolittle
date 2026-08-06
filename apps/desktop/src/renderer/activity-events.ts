import { asRecord } from "./value-guards";

export type ActivityKind =
  | "delivery"
  | "terminal"
  | "log"
  | "approval"
  | "change"
  | "task"
  | "run";

export type ActivitySource = "all" | ActivityKind;
export type ActivitySeverity = "info" | "warning" | "critical";
export type ActivityLiveness = "live" | "settled" | "snapshot";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  atMs: number;
  source: string;
  verb: string;
  object: string;
  outcome: string;
  status: string;
  severity: ActivitySeverity;
  liveness: ActivityLiveness;
  context: string;
  lifecycle: string;
  raw: string;
  relatedCount: number;
  correlationKey?: string;
}

export interface ActivitySources {
  deliveries?: unknown[];
  terminal?: unknown[];
  logs?: unknown[];
  approvals?: unknown[];
  changes?: unknown[];
  tasks?: unknown[];
  runs?: unknown[];
}

const RAW_LIMIT = 2_400;
const COPY_LIMIT = 320;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function bounded(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length <= limit
    ? compact
    : `${compact.slice(0, limit).trimEnd()}…`;
}

function renderRaw(value: unknown): string {
  try {
    return bounded(JSON.stringify(value, null, 2), RAW_LIMIT);
  } catch {
    return bounded(String(value), RAW_LIMIT);
  }
}

function pickTime(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return "";
}

function timeMs(at: string): number {
  const parsed = new Date(at).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/gu, " ")
    .replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

function normalizedStatus(record: Record<string, unknown>, fallback: string) {
  return asString(
    record.status,
    asString(record.state, asString(record.phase, fallback)),
  ).toLowerCase();
}

function lifecycleFor(
  record: Record<string, unknown>,
  startKeys = ["startedAt", "createdAt"],
  endKeys = ["completedAt", "updatedAt"],
): string {
  const started = pickTime(record, startKeys);
  const completed = pickTime(record, endKeys);
  if (started && completed && started !== completed) {
    return `Started ${started} · last updated ${completed}`;
  }
  if (started) return `Started ${started}`;
  if (completed) return `Last updated ${completed}`;
  return "";
}

function correlationFrom(
  record: Record<string, unknown>,
  kind: ActivityKind,
  fallback?: string,
): string | undefined {
  const candidates =
    kind === "task"
      ? [record.id, record.taskId]
      : kind === "run"
        ? [record.id, record.runId, record.workflowId]
        : kind === "terminal"
          ? [record.id, record.commandId, record.executionSessionId]
          : kind === "approval"
            ? [record.id, record.approvalId]
            : [
                record.correlationId,
                record.runId,
                record.taskId,
                record.requestId,
                record.sessionId,
              ];
  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return value ? `${kind}:${value}` : fallback;
}

function presentationForStatus(
  rawStatus: string,
  fallbackLiveness: ActivityLiveness = "settled",
): Pick<ActivityEvent, "status" | "severity" | "liveness"> {
  const status = rawStatus.trim().toLowerCase() || "recorded";
  if (
    ["fatal", "error", "failed", "failure", "denied", "timed-out"].includes(
      status,
    )
  ) {
    return {
      status: titleCase(status),
      severity: "critical",
      liveness: "settled",
    };
  }
  if (
    ["running", "active", "started", "streaming", "in-progress"].includes(
      status,
    )
  ) {
    return { status: titleCase(status), severity: "info", liveness: "live" };
  }
  if (
    ["warn", "warning", "pending", "waiting", "cancelled", "canceled"].includes(
      status,
    )
  ) {
    return {
      status: titleCase(status),
      severity: "warning",
      liveness:
        status === "pending" || status === "waiting"
          ? "live"
          : fallbackLiveness,
    };
  }
  return {
    status: titleCase(status),
    severity: "info",
    liveness: fallbackLiveness,
  };
}

function deliveryEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const at = pickTime(record, ["updatedAt", "createdAt"]);
  if (!at) return null;
  const target = asRecord(record.target);
  const platform = asString(target.platform, "connected destination");
  const status = normalizedStatus(record, "delivered");
  const presentation = presentationForStatus(status);
  const id = asString(record.id, `delivery:${at}`);
  const edited =
    Boolean(record.editOfId) || (asNumber(record.editCount) ?? 0) > 0;
  return {
    id: `delivery:${id}`,
    kind: "delivery",
    at,
    atMs: timeMs(at),
    source: "Delivery",
    verb: edited ? "Updated" : "Delivered",
    object: `message to ${platform}`,
    outcome: edited
      ? "The destination copy was revised."
      : "Sent successfully.",
    ...presentation,
    context: bounded(asString(record.text, "Outbound message"), COPY_LIMIT),
    lifecycle: lifecycleFor(record, ["createdAt"], ["updatedAt"]),
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(record, "delivery", `delivery:${id}`),
  };
}

function terminalEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const at = pickTime(record, ["completedAt", "startedAt"]);
  if (!at) return null;
  const exitCode = asNumber(record.exitCode);
  const timedOut = Boolean(record.timedOut);
  const running = exitCode === undefined && !record.completedAt;
  const status = timedOut
    ? "timed-out"
    : running
      ? "running"
      : exitCode === 0
        ? "completed"
        : "failed";
  const presentation = presentationForStatus(status);
  const duration = asNumber(record.durationMs);
  const backend = asString(record.backend, "local");
  const id = asString(record.id, `terminal:${at}`);
  return {
    id: `terminal:${id}`,
    kind: "terminal",
    at,
    atMs: timeMs(at),
    source: "Terminal",
    verb: running
      ? "Running"
      : timedOut
        ? "Timed out"
        : exitCode === 0
          ? "Ran"
          : "Command failed",
    object: bounded(asString(record.command, "unknown command"), 180),
    outcome: running
      ? `Executing on ${backend}.`
      : timedOut
        ? `Exceeded its ${asNumber(record.timeoutMs) ?? "configured"} ms limit.`
        : exitCode === 0
          ? `Exited cleanly${duration !== undefined ? ` in ${formatDuration(duration)}` : ""}.`
          : `Exited with code ${exitCode ?? "unknown"}${duration !== undefined ? ` after ${formatDuration(duration)}` : ""}.`,
    ...presentation,
    context: [
      asString(record.cwd) ? `Working directory: ${asString(record.cwd)}` : "",
      asString(record.stderr)
        ? `Error: ${bounded(asString(record.stderr), 180)}`
        : asString(record.stdout)
          ? `Output: ${bounded(asString(record.stdout), 180)}`
          : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lifecycle: lifecycleFor(record),
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(record, "terminal", `terminal:${id}`),
  };
}

function logEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const at = pickTime(record, ["at", "updatedAt", "createdAt"]);
  if (!at) return null;
  const level = asString(record.level, "info").toLowerCase();
  const message = bounded(
    asString(record.message, "Runtime event"),
    COPY_LIMIT,
  );
  const scope = asString(record.scope, asString(record.logger, "runtime"));
  const presentation = presentationForStatus(level);
  const fields = asRecord(record.fields);
  const phase = normalizedStatus(fields, "");
  const phasePresentation = phase ? presentationForStatus(phase) : presentation;
  const id = `${scope}:${at}:${message}`;
  return {
    id: `log:${id}`,
    kind: "log",
    at,
    atMs: timeMs(at),
    source: "Runtime",
    verb:
      phasePresentation.liveness === "live"
        ? "Working on"
        : phasePresentation.severity === "critical"
          ? "Reported failure in"
          : "Reported from",
    object: scope,
    outcome: message,
    ...phasePresentation,
    status: titleCase(phase || level),
    context: bounded(
      asString(
        record.detail,
        Object.keys(fields).length ? renderRaw(fields) : "",
      ),
      COPY_LIMIT,
    ),
    lifecycle: `Recorded ${at}`,
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(
      { ...record, ...fields },
      "log",
      `log:${id}`,
    ),
  };
}

function approvalEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const at = pickTime(record, ["updatedAt", "createdAt", "expiresAt"]);
  const status = normalizedStatus(record, "pending");
  const presentation = presentationForStatus(status);
  return {
    id: `approval:${id}`,
    kind: "approval",
    at,
    atMs: timeMs(at),
    source: "Review",
    verb:
      status === "pending"
        ? "Needs approval for"
        : status === "approved"
          ? "Approved"
          : status === "denied"
            ? "Denied"
            : "Reviewed",
    object: bounded(asString(record.command, "command request"), 180),
    outcome:
      bounded(asString(record.reason), COPY_LIMIT) ||
      `The request is ${status}.`,
    ...presentation,
    context: [
      asString(record.platform),
      asString(record.expiresAt) ? `Expires ${asString(record.expiresAt)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lifecycle: lifecycleFor(record, ["createdAt"], ["updatedAt", "expiresAt"]),
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(record, "approval", `approval:${id}`),
  };
}

function changeEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const path = asString(record.path);
  if (!path) return null;
  const staged = Boolean(record.staged);
  const untracked = Boolean(record.untracked);
  const previousPath = asString(record.previousPath);
  const indexStatus = asString(record.indexStatus).trim();
  const worktreeStatus = asString(record.worktreeStatus).trim();
  const status = untracked ? "untracked" : staged ? "staged" : "working";
  const verb = previousPath
    ? "Renamed"
    : untracked
      ? "Added"
      : staged
        ? "Staged"
        : "Modified";
  return {
    id: `change:${path}`,
    kind: "change",
    at: "",
    atMs: 0,
    source: "Workspace",
    verb,
    object: path,
    outcome: previousPath
      ? `Moved from ${previousPath}.`
      : staged
        ? "Ready for the next commit."
        : "Present in the current working tree.",
    ...presentationForStatus(status, "snapshot"),
    severity: "info",
    liveness: "snapshot",
    context: [
      indexStatus ? `Index ${indexStatus}` : "",
      worktreeStatus ? `Worktree ${worktreeStatus}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lifecycle: "Current workspace state",
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: `change:${path}`,
  };
}

function taskEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const at = pickTime(record, [
    "completedAt",
    "updatedAt",
    "startedAt",
    "createdAt",
  ]);
  const status = normalizedStatus(record, "pending");
  const presentation = presentationForStatus(status);
  const verb =
    status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : status === "cancelled"
          ? "Cancelled"
          : status === "running"
            ? "Working on"
            : "Queued";
  return {
    id: `task:${id}`,
    kind: "task",
    at,
    atMs: timeMs(at),
    source: "Agents",
    verb,
    object: bounded(asString(record.title, id), 180),
    outcome:
      bounded(asString(record.objective), COPY_LIMIT) || `Task is ${status}.`,
    ...presentation,
    context: [
      asString(record.profile, "default"),
      asString(record.group),
      asString(record.executionMode),
      asNumber(record.attempts) !== undefined
        ? `${asNumber(record.attempts)} attempt${asNumber(record.attempts) === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lifecycle: lifecycleFor(record),
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(record, "task", `task:${id}`),
  };
}

function runEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const at = pickTime(record, [
    "completedAt",
    "updatedAt",
    "startedAt",
    "createdAt",
  ]);
  const status = normalizedStatus(record, "recorded");
  const presentation = presentationForStatus(status);
  const project = asString(
    record.projectName,
    asString(record.repositoryName, asString(record.title, id)),
  );
  const artifactCount =
    asNumber(record.artifactCount) ??
    (Array.isArray(record.artifacts) ? record.artifacts.length : 0);
  const verb =
    status === "completed"
      ? "Generated"
      : status === "failed"
        ? "Generation failed for"
        : status === "cancelled"
          ? "Cancelled generation for"
          : status === "running"
            ? "Generating"
            : "Prepared generation for";
  return {
    id: `run:${id}`,
    kind: "run",
    at,
    atMs: timeMs(at),
    source: "Codegen",
    verb,
    object: project,
    outcome:
      bounded(
        asString(record.error, asString(record.outputPreview)),
        COPY_LIMIT,
      ) ||
      `${artifactCount} artifact${artifactCount === 1 ? "" : "s"} recorded.`,
    ...presentation,
    context: [
      asString(record.kind, asString(record.phase, "generation")),
      artifactCount
        ? `${artifactCount} artifact${artifactCount === 1 ? "" : "s"}`
        : "",
      asString(record.workflowId)
        ? `Workflow ${asString(record.workflowId)}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lifecycle: lifecycleFor(record),
    raw: renderRaw(record),
    relatedCount: 1,
    correlationKey: correlationFrom(record, "run", `run:${id}`),
  };
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
}

function statusWeight(event: ActivityEvent): number {
  if (event.severity === "critical") return 4;
  if (event.liveness === "settled") return 3;
  if (event.liveness === "live") return 2;
  return 1;
}

/**
 * Fold duplicate lifecycle records that expose a shared correlation key.
 * The most conclusive record supplies the visible outcome while the newest
 * timestamp and every bounded raw payload remain inspectable.
 */
export function coalesceActivityEvents(
  events: readonly ActivityEvent[],
): ActivityEvent[] {
  const grouped = new Map<string, ActivityEvent>();
  for (const event of events) {
    const key = event.correlationKey ?? event.id;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, event);
      continue;
    }
    const conclusive =
      statusWeight(event) >= statusWeight(current) ? event : current;
    const newest = event.atMs >= current.atMs ? event : current;
    const raw = renderRaw({
      records: [current.raw, event.raw],
    });
    grouped.set(key, {
      ...conclusive,
      id: current.id,
      at: newest.at,
      atMs: newest.atMs,
      lifecycle: [current.lifecycle, event.lifecycle]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" · "),
      raw,
      relatedCount: current.relatedCount + event.relatedCount,
      correlationKey: key,
    });
  }
  return [...grouped.values()];
}

export function buildActivityEvents(sources: ActivitySources): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const append = (
    values: unknown[] | undefined,
    parser: (value: unknown) => ActivityEvent | null,
  ) => {
    for (const value of values ?? []) {
      const event = parser(value);
      if (event) events.push(event);
    }
  };

  append(sources.deliveries, deliveryEvent);
  append(sources.terminal, terminalEvent);
  append(sources.logs, logEvent);
  append(sources.approvals, approvalEvent);
  append(sources.changes, changeEvent);
  append(sources.tasks, taskEvent);
  append(sources.runs, runEvent);

  return coalesceActivityEvents(events)
    .sort((left, right) => {
      const byTime = right.atMs - left.atMs;
      return byTime || right.id.localeCompare(left.id);
    })
    .slice(0, 120);
}

export function activityTone(
  event: ActivityEvent,
): "neutral" | "good" | "warn" | "bad" {
  if (event.severity === "critical") return "bad";
  if (event.severity === "warning" || event.liveness === "live") return "warn";
  if (
    ["Completed", "Approved", "Delivered", "Success"].includes(event.status)
  ) {
    return "good";
  }
  return "neutral";
}
