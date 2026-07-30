import type { AutomationRunRecord, DelegationTaskRecord } from "@/types";
import type { DeliveredMessageRecord } from "@/types/gateway";
import type { ExecutionApprovalRecord } from "../execution-approval/types";
import type { RunSnapshot } from "../run-controller/types";

export type ActivityEventKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery";

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
  | "delivered";

export type ActivityEventTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration";

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
}

export interface ActivityFeedOptions {
  limit?: number;
  after?: string;
}

export interface ActivityFeedSourceData {
  automationRuns?: AutomationRunRecord[];
  delegationTasks?: DelegationTaskRecord[];
}

export interface ActivityFeedResult {
  events: ActivityEvent[];
  cursor: string | null;
  updatedAt: string | null;
}

interface ActivityCursor {
  occurredAt: string;
  id: string;
}

const MAX_ACTIVITY_EVENTS = 200;
const MAX_SOURCE_ID_LENGTH = 256;

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

export function buildActivityFeed(
  services: ActivityFeedServices,
  options: ActivityFeedOptions = {},
  sourceData: ActivityFeedSourceData = {},
): ActivityFeedResult {
  const normalized = [
    ...services.runController
      .listReceipts(MAX_ACTIVITY_EVENTS)
      .map(normalizeRun),
    ...(sourceData.automationRuns ?? [])
      .slice(0, MAX_ACTIVITY_EVENTS)
      .map(normalizeAutomation),
    ...(sourceData.delegationTasks ?? []).map(normalizeDelegation),
    ...services.executionApprovals.list().map(normalizeApproval),
    ...services.delivery.recent(MAX_ACTIVITY_EVENTS).map(normalizeDelivery),
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
  ).slice(0, limit);
  const lastEvent = events.at(-1);
  return {
    events,
    cursor: lastEvent ? encodeActivityCursor(lastEvent) : null,
    updatedAt,
  };
}

export const ACTIVITY_FEED_MAX_LIMIT = MAX_ACTIVITY_EVENTS;
