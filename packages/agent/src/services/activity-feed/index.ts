import type { AppLogRecord } from "@/logging/logger";
import type { AutocoderPipelineRunRecord } from "@/services/autocoder-pipeline";
import type { RepositoryChange } from "@/services/repository-service";
import type { AutomationRunRecord, DelegationTaskRecord } from "@/types";
import type { TerminalCommandRecord } from "@/types/execution";
import type { DeliveredMessageRecord } from "@/types/gateway";
import type { ExecutionApprovalRecord } from "../execution-approval/types";
import type { RunSnapshot } from "../run-controller/types";

export type ActivityEventKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery"
  | "terminal"
  | "repository-change"
  | "codegen"
  | "log";

export type ActivityEventStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "approved"
  | "denied"
  | "expired"
  | "used"
  | "delivered"
  | "recorded";

export type ActivityEventTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration"
  | "terminal"
  | "workspace"
  | "codegen"
  | "operations";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  sourceId: string;
  sessionId?: string;
  status: ActivityEventStatus;
  occurredAt: string;
  title: string;
  safeSummary: string;
  target: ActivityEventTarget;
}

export interface ActivityFeedServices {
  runController: {
    listReceipts(limit?: number): RunSnapshot[];
  };
  executionApprovals: {
    list(): ExecutionApprovalRecord[];
  };
  delivery: {
    recent(limit?: number): DeliveredMessageRecord[];
  };
  terminal: {
    recent(limit?: number): TerminalCommandRecord[];
  };
  logger: {
    list(limit?: number): AppLogRecord[];
  };
  autocoderPipeline: {
    list(limit?: number): AutocoderPipelineRunRecord[];
  };
}

export interface ActivityFeedOptions {
  limit?: number;
  after?: string;
  filters?: ActivityFeedFilters;
}

/**
 * Narrow, server-validated association filters for the operator timeline.
 * Raw source records deliberately stay behind this DTO boundary.
 */
export interface ActivityFeedFilters {
  kind?: ActivityEventKind;
  status?: ActivityEventStatus;
  target?: ActivityEventTarget;
  sessionId?: string;
}

export interface ActivityFeedSourceData {
  automationRuns?: AutomationRunRecord[];
  delegationTasks?: DelegationTaskRecord[];
  repositoryChanges?: RepositoryChange[];
  repositoryObservedAt?: string;
}

export interface ActivityFeedResult {
  events: ActivityEvent[];
  cursor: string | null;
  updatedAt: string | null;
}

export interface ActivityExportEvent {
  kind: ActivityEventKind;
  status: ActivityEventStatus;
  occurredAt: string;
  title: string;
  safeSummary: string;
  target: ActivityEventTarget;
}

export interface ActivityExportResult {
  schemaVersion: 1;
  generatedAt: string;
  redaction: "summary-only";
  byteLimit: number;
  byteLength: number;
  truncated: boolean;
  events: ActivityExportEvent[];
}

interface ActivityCursor {
  occurredAt: string;
  id: string;
}

const MAX_ACTIVITY_EVENTS = 200;
const MAX_SOURCE_ID_LENGTH = 256;
const MAX_ACTIVITY_EXPORT_BYTES = 32 * 1024;

function validSourceId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_SOURCE_ID_LENGTH &&
    Array.from(value).every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
  );
}

function validTimestamp(value: string | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function eventId(kind: ActivityEventKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

function normalizeRun(run: RunSnapshot): ActivityEvent | null {
  if (!validSourceId(run.runId) || !validTimestamp(run.updatedAt)) return null;
  const status: ActivityEventStatus =
    run.status === "complete"
      ? "succeeded"
      : run.status === "error"
        ? "failed"
        : run.status === "cancelled"
          ? "cancelled"
          : "running";
  const title =
    status === "succeeded"
      ? "Chat run completed"
      : status === "failed"
        ? "Chat run failed"
        : status === "cancelled"
          ? "Chat run cancelled"
          : "Chat run in progress";
  return {
    id: eventId("chat-run", run.runId),
    kind: "chat-run",
    sourceId: run.runId,
    ...(validSourceId(run.sessionId) ? { sessionId: run.sessionId } : {}),
    status,
    occurredAt: run.updatedAt,
    title,
    safeSummary: `${title} with ${Math.max(0, run.observedActionCount)} recorded ${
      run.observedActionCount === 1 ? "action" : "actions"
    }.`,
    target: "chat",
  };
}

function normalizeAutomation(run: AutomationRunRecord): ActivityEvent | null {
  const occurredAt = run.completedAt ?? run.startedAt ?? run.createdAt;
  if (!validSourceId(run.id) || !validTimestamp(occurredAt)) return null;
  const status: ActivityEventStatus =
    run.status === "failed"
      ? "failed"
      : run.status === "skipped"
        ? "skipped"
        : "succeeded";
  const title =
    status === "failed"
      ? "Automation run failed"
      : status === "skipped"
        ? "Automation run skipped"
        : "Automation run completed";
  return {
    id: eventId("automation", run.id),
    kind: "automation",
    sourceId: run.id,
    status,
    occurredAt,
    title,
    safeSummary:
      status === "failed"
        ? "An automation finished with an error."
        : status === "skipped"
          ? "An automation was skipped by its configured conditions."
          : "An automation finished successfully.",
    target: "automations",
  };
}

function normalizeDelegation(task: DelegationTaskRecord): ActivityEvent | null {
  const occurredAt = task.completedAt ?? task.updatedAt ?? task.createdAt;
  if (!validSourceId(task.id) || !validTimestamp(occurredAt)) return null;
  const status: ActivityEventStatus =
    task.status === "completed"
      ? "succeeded"
      : task.status === "failed"
        ? "failed"
        : task.status === "cancelled"
          ? "cancelled"
          : task.status === "running"
            ? "running"
            : "pending";
  const title =
    status === "succeeded"
      ? "Delegated task completed"
      : status === "failed"
        ? "Delegated task failed"
        : status === "cancelled"
          ? "Delegated task cancelled"
          : status === "running"
            ? "Delegated task running"
            : "Delegated task queued";
  const attempts = Math.max(0, task.attempts ?? 0);
  return {
    id: eventId("delegation", task.id),
    kind: "delegation",
    sourceId: task.id,
    status,
    occurredAt,
    title,
    safeSummary: `${title}${attempts > 0 ? ` after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}` : ""}.`,
    target: "orchestration",
  };
}

function approvalTimestamp(record: ExecutionApprovalRecord): string {
  if (record.status === "used" && record.usedAt) return record.usedAt;
  if (record.status === "denied" && record.deniedAt) return record.deniedAt;
  if (record.status === "approved" && record.approvedAt) {
    return record.approvedAt;
  }
  if (record.status === "expired") return record.expiresAt;
  return record.createdAt;
}

function normalizeApproval(
  record: ExecutionApprovalRecord,
): ActivityEvent | null {
  const occurredAt = approvalTimestamp(record);
  if (!validSourceId(record.id) || !validTimestamp(occurredAt)) return null;
  const status: ActivityEventStatus = record.status;
  const title =
    status === "pending"
      ? "Approval requested"
      : status === "approved"
        ? "Approval granted"
        : status === "denied"
          ? "Approval denied"
          : status === "expired"
            ? "Approval expired"
            : "Approval used";
  return {
    id: eventId("approval", record.id),
    kind: "approval",
    sourceId: record.id,
    ...(record.sessionKey && validSourceId(record.sessionKey)
      ? { sessionId: record.sessionKey }
      : {}),
    status,
    occurredAt,
    title,
    safeSummary: `${title} for a protected execution request.`,
    target: "review",
  };
}

function normalizeDelivery(
  record: DeliveredMessageRecord,
): ActivityEvent | null {
  const occurredAt = record.updatedAt ?? record.createdAt;
  if (!validSourceId(record.id) || !validTimestamp(occurredAt)) return null;
  return {
    id: eventId("delivery", record.id),
    kind: "delivery",
    sourceId: record.id,
    status: "delivered",
    occurredAt,
    title: record.updatedAt ? "Delivery updated" : "Message delivered",
    safeSummary: record.updatedAt
      ? "A previously delivered message was updated."
      : "A message was delivered successfully.",
    target: "chat",
  };
}

function normalizeTerminal(
  record: TerminalCommandRecord,
): ActivityEvent | null {
  const occurredAt = record.completedAt || record.startedAt;
  if (!validSourceId(record.id) || !validTimestamp(occurredAt)) return null;
  const status: ActivityEventStatus = record.timedOut
    ? "failed"
    : record.exitCode === 0
      ? "succeeded"
      : "failed";
  const title = record.timedOut
    ? "Terminal command timed out"
    : status === "succeeded"
      ? "Terminal command completed"
      : "Terminal command failed";
  const duration = Number.isFinite(record.durationMs)
    ? ` after ${Math.max(0, Math.round(record.durationMs ?? 0))} ms`
    : "";
  return {
    id: eventId("terminal", record.id),
    kind: "terminal",
    sourceId: record.id,
    status,
    occurredAt,
    title,
    safeSummary: record.timedOut
      ? "A terminal command exceeded its configured time limit."
      : status === "succeeded"
        ? `A terminal command completed successfully${duration}.`
        : `A terminal command exited with a non-zero status${duration}.`,
    target: "terminal",
  };
}

function normalizeRepositoryChange(
  record: RepositoryChange,
  index: number,
  observedAt: string | undefined,
): ActivityEvent | null {
  if (!validTimestamp(observedAt)) return null;
  const status = record.untracked
    ? "untracked"
    : record.staged
      ? "staged"
      : "modified";
  const title =
    status === "untracked"
      ? "Untracked repository change observed"
      : status === "staged"
        ? "Staged repository change observed"
        : "Repository change observed";
  return {
    id: eventId("repository-change", `change-${index}`),
    kind: "repository-change",
    sourceId: `change-${index}`,
    status: "recorded",
    occurredAt: observedAt,
    title,
    safeSummary:
      "A repository change is present in the active workspace. File paths are intentionally omitted.",
    target: "workspace",
  };
}

function normalizeCodegen(
  record: AutocoderPipelineRunRecord,
): ActivityEvent | null {
  const occurredAt = record.completedAt ?? record.updatedAt ?? record.startedAt;
  if (!validSourceId(record.id) || !validTimestamp(occurredAt)) return null;
  const status: ActivityEventStatus =
    record.status === "completed"
      ? "succeeded"
      : record.status === "failed"
        ? "failed"
        : record.status === "cancelled"
          ? "cancelled"
          : record.status === "running"
            ? "running"
            : "pending";
  const title =
    status === "succeeded"
      ? "Code generation run completed"
      : status === "failed"
        ? "Code generation run failed"
        : status === "cancelled"
          ? "Code generation run cancelled"
          : status === "running"
            ? "Code generation run in progress"
            : "Code generation run queued";
  const artifacts = Math.max(0, record.artifactPaths.length);
  return {
    id: eventId("codegen", record.id),
    kind: "codegen",
    sourceId: record.id,
    ...(record.sessionId && validSourceId(record.sessionId)
      ? { sessionId: record.sessionId }
      : {}),
    status,
    occurredAt,
    title,
    safeSummary:
      status === "succeeded"
        ? `${title} with ${artifacts} recorded ${artifacts === 1 ? "artifact" : "artifacts"}.`
        : `${title}.`,
    target: "codegen",
  };
}

function normalizeLog(
  record: AppLogRecord,
  index: number,
): ActivityEvent | null {
  if (!validTimestamp(record.at)) return null;
  const status: ActivityEventStatus =
    record.level === "error" || record.level === "fatal"
      ? "failed"
      : "recorded";
  const title =
    status === "failed" ? "Runtime failure recorded" : "Runtime event recorded";
  return {
    id: eventId("log", `log-${index}`),
    kind: "log",
    sourceId: `log-${index}`,
    status,
    occurredAt: record.at,
    title,
    safeSummary:
      status === "failed"
        ? "The runtime recorded an error event. Log content is intentionally omitted."
        : "The runtime recorded an operational event. Log content is intentionally omitted.",
    target: "operations",
  };
}

function compareEvents(left: ActivityEvent, right: ActivityEvent): number {
  const timestamp = right.occurredAt.localeCompare(left.occurredAt);
  return timestamp || right.id.localeCompare(left.id);
}

export function encodeActivityCursor(event: ActivityEvent): string {
  return Buffer.from(
    JSON.stringify([event.occurredAt, event.id]),
    "utf8",
  ).toString("base64url");
}

export function decodeActivityCursor(cursor: string): ActivityCursor | null {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !validTimestamp(value[0] as string) ||
      typeof value[1] !== "string" ||
      !value[1]
    ) {
      return null;
    }
    return { occurredAt: value[0], id: value[1] };
  } catch {
    return null;
  }
}

function isAfterCursor(event: ActivityEvent, cursor: ActivityCursor): boolean {
  return (
    event.occurredAt < cursor.occurredAt ||
    (event.occurredAt === cursor.occurredAt && event.id < cursor.id)
  );
}

function matchesFilters(
  event: ActivityEvent,
  filters: ActivityFeedFilters | undefined,
): boolean {
  if (!filters) return true;
  return (
    (!filters.kind || event.kind === filters.kind) &&
    (!filters.status || event.status === filters.status) &&
    (!filters.target || event.target === filters.target) &&
    (!filters.sessionId || event.sessionId === filters.sessionId)
  );
}

export function buildActivityFeed(
  services: ActivityFeedServices,
  options: ActivityFeedOptions = {},
  sourceData: ActivityFeedSourceData = {},
): ActivityFeedResult {
  const normalized = [
    ...services.runController
      .listReceipts(MAX_ACTIVITY_EVENTS)
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeRun),
    ...(sourceData.automationRuns ?? [])
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeAutomation),
    ...(sourceData.delegationTasks ?? [])
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeDelegation),
    ...services.executionApprovals
      .list()
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeApproval),
    ...services.delivery
      .recent(MAX_ACTIVITY_EVENTS)
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeDelivery),
    ...services.terminal
      .recent(MAX_ACTIVITY_EVENTS)
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeTerminal),
    ...services.autocoderPipeline
      .list(MAX_ACTIVITY_EVENTS)
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeCodegen),
    ...services.logger
      .list(MAX_ACTIVITY_EVENTS)
      .slice(-MAX_ACTIVITY_EVENTS)
      .map(normalizeLog),
    ...(sourceData.repositoryChanges ?? [])
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map((record, index) =>
        normalizeRepositoryChange(
          record,
          index,
          sourceData.repositoryObservedAt,
        ),
      ),
  ].filter((event): event is ActivityEvent => event !== null);
  const deduped = Array.from(
    new Map(normalized.map((event) => [event.id, event])).values(),
  ).sort(compareEvents);
  const updatedAt = deduped.at(0)?.occurredAt ?? null;
  const after = options.after ? decodeActivityCursor(options.after) : null;
  const limit = Math.min(
    MAX_ACTIVITY_EVENTS,
    Math.max(1, Math.floor(options.limit ?? 50)),
  );
  const events = (
    after ? deduped.filter((event) => isAfterCursor(event, after)) : deduped
  )
    .filter((event) => matchesFilters(event, options.filters))
    .slice(0, limit);
  const lastEvent = events.at(-1);
  return {
    events,
    cursor: lastEvent ? encodeActivityCursor(lastEvent) : null,
    updatedAt,
  };
}

export const ACTIVITY_FEED_MAX_LIMIT = MAX_ACTIVITY_EVENTS;
export const ACTIVITY_EXPORT_MAX_BYTES = MAX_ACTIVITY_EXPORT_BYTES;

function exportEvent(event: ActivityEvent): ActivityExportEvent {
  return {
    kind: event.kind,
    status: event.status,
    occurredAt: event.occurredAt,
    title: event.title,
    safeSummary: event.safeSummary,
    target: event.target,
  };
}

function exportByteLength(
  value: Omit<ActivityExportResult, "byteLength">,
): number {
  return Buffer.byteLength(JSON.stringify({ ...value, byteLength: 0 }), "utf8");
}

function finalizeActivityExport(
  value: Omit<ActivityExportResult, "byteLength">,
): ActivityExportResult {
  let byteLength = exportByteLength(value);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = Buffer.byteLength(
      JSON.stringify({ ...value, byteLength }),
      "utf8",
    );
    if (next === byteLength) break;
    byteLength = next;
  }
  return { ...value, byteLength };
}

/**
 * Produces a bounded support-safe export. Association identifiers are useful
 * inside the authenticated operator UI, but are intentionally excluded from
 * exported artifacts so a timeline cannot become a side channel for session
 * or source identifiers.
 */
export function buildActivityExport(
  feed: ActivityFeedResult,
  generatedAt = new Date().toISOString(),
): ActivityExportResult {
  const events: ActivityExportEvent[] = [];
  let truncated = false;
  for (const event of feed.events) {
    const candidate = exportEvent(event);
    const payload = {
      schemaVersion: 1 as const,
      generatedAt,
      redaction: "summary-only" as const,
      byteLimit: MAX_ACTIVITY_EXPORT_BYTES,
      truncated: false,
      events: [...events, candidate],
    };
    // Leave a small envelope for the final byteLength digits so the serialized
    // response remains within the public cap as well as the candidate payload.
    if (exportByteLength(payload) > MAX_ACTIVITY_EXPORT_BYTES - 32) {
      truncated = true;
      break;
    }
    events.push(candidate);
  }
  if (events.length < feed.events.length) truncated = true;
  const base = {
    schemaVersion: 1 as const,
    generatedAt,
    redaction: "summary-only" as const,
    byteLimit: MAX_ACTIVITY_EXPORT_BYTES,
    truncated,
    events,
  };
  return finalizeActivityExport(base);
}
