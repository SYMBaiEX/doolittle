import type { ActivityEvent, ActivityEventKind } from "../../shared/contracts";
import { progressiveWindow } from "../components/progressive-window";

export const ACTIVITY_PAGE_SIZE = 20;

export function visibleActivityWindow<T>(
  events: readonly T[],
  visibleCount: number,
): readonly T[] {
  return progressiveWindow(events, {
    pageSize: ACTIVITY_PAGE_SIZE,
    requested: visibleCount,
  }).visible;
}

export function activitySummaryIsDistinct(
  title: string,
  summary: string,
): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s.!?;:]+$/u, "");
  return Boolean(summary.trim()) && normalize(summary) !== normalize(title);
}

interface GroupableActivityEvent {
  id: string;
  kind: string;
  safeSummary: string;
  status: string;
  target: string;
  title: string;
}

export interface ActivityEventGroup<T> {
  count: number;
  event: T;
  summary: string;
}

const COMPLETED_CHAT_RUN_SUMMARY =
  /^Chat run completed with (?<actions>\d+) recorded actions?\.$/u;

function completedChatRunActions(event: GroupableActivityEvent): number | null {
  if (
    event.kind !== "chat-run" ||
    event.status !== "succeeded" ||
    event.title !== "Chat run completed"
  ) {
    return null;
  }
  const actions = COMPLETED_CHAT_RUN_SUMMARY.exec(event.safeSummary)?.groups
    ?.actions;
  return actions === undefined ? null : Number.parseInt(actions, 10);
}

export function groupConsecutiveActivityEvents<
  T extends GroupableActivityEvent,
>(events: readonly T[]): Array<ActivityEventGroup<T>> {
  const groups: Array<ActivityEventGroup<T> & { recordedActions?: number }> =
    [];
  for (const event of events) {
    const previous = groups.at(-1);
    const exactMatch =
      previous?.event.kind === event.kind &&
      previous.event.safeSummary === event.safeSummary &&
      previous.event.status === event.status &&
      previous.event.target === event.target &&
      previous.event.title === event.title;
    const eventActions = completedChatRunActions(event);
    const aggregatesCompletedChatRuns =
      previous?.recordedActions !== undefined &&
      eventActions !== null &&
      previous.event.kind === event.kind &&
      previous.event.status === event.status &&
      previous.event.target === event.target &&
      previous.event.title === event.title;
    if (previous && (exactMatch || aggregatesCompletedChatRuns)) {
      previous.count += 1;
      if (aggregatesCompletedChatRuns) {
        previous.recordedActions =
          (previous.recordedActions ?? 0) + eventActions;
        previous.summary = `${previous.count} chat runs completed with ${previous.recordedActions} recorded ${previous.recordedActions === 1 ? "action" : "actions"}.`;
      }
    } else {
      groups.push({
        count: 1,
        event,
        summary: event.safeSummary,
        ...(eventActions === null ? {} : { recordedActions: eventActions }),
      });
    }
  }
  return groups.map(({ count, event, summary }) => ({ count, event, summary }));
}

export const ACTIVITY_SOURCE_LABELS: Record<ActivityEventKind, string> = {
  "chat-run": "Chat",
  automation: "Automation",
  delegation: "Task",
  approval: "Approval",
  delivery: "Delivery",
  terminal: "Terminal",
  "repository-change": "Workspace",
  codegen: "Codegen",
  log: "Runtime",
};

export function activityTone(
  event: ActivityEvent,
): "good" | "warn" | "bad" | "neutral" {
  if (event.status === "failed" || event.status === "denied") return "bad";
  if (event.status === "pending" || event.status === "running") return "warn";
  return "neutral";
}

export function activityState(event: ActivityEvent): {
  severity: "info" | "warning" | "critical";
  liveness: "live" | "settled";
} {
  if (event.status === "failed" || event.status === "denied") {
    return { severity: "critical", liveness: "settled" };
  }
  if (event.status === "pending" || event.status === "running") {
    return { severity: "warning", liveness: "live" };
  }
  return { severity: "info", liveness: "settled" };
}
