export type OrchestrationStatusTier =
  | "running"
  | "queued"
  | "approval"
  | "completed"
  | "failed"
  | "idle";

type OrchestrationTimingOptions = {
  status?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  now?: number;
};

function parseTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function orchestrationStatusTier(
  status?: string,
): OrchestrationStatusTier {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    ["running", "active", "executing", "in_progress", "in-progress"].includes(
      normalized,
    )
  ) {
    return "running";
  }
  if (
    ["draft", "approval", "needs_approval", "needs-approval"].includes(
      normalized,
    )
  ) {
    return "approval";
  }
  if (
    ["queued", "pending", "waiting", "created", "ready", "scheduled"].includes(
      normalized,
    )
  ) {
    return "queued";
  }
  if (["completed", "done", "success", "succeeded"].includes(normalized)) {
    return "completed";
  }
  if (
    ["failed", "cancelled", "error", "stalled", "aborted"].includes(normalized)
  ) {
    return "failed";
  }
  return "idle";
}

export function compactDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "<1m";
  if (ms < 60_000) return "<1m";
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
}

export function orchestrationTimingLabel({
  status,
  startedAt,
  completedAt,
  updatedAt,
  createdAt,
  now = Date.now(),
}: OrchestrationTimingOptions): string {
  const tier = orchestrationStatusTier(status);
  const started = parseTimestamp(startedAt);
  const completed = parseTimestamp(completedAt);
  const updated = parseTimestamp(updatedAt);
  const created = parseTimestamp(createdAt);

  if (
    started !== null &&
    completed !== null &&
    completed >= started &&
    (tier === "completed" || tier === "failed")
  ) {
    const duration = compactDuration(completed - started);
    return tier === "completed"
      ? `Done in ${duration}`
      : `Stopped after ${duration}`;
  }

  const origin = started ?? updated ?? created;
  if (origin !== null) {
    const duration = compactDuration(Math.max(0, now - origin));
    if (tier === "running") return `Live ${duration}`;
    if (tier === "approval") return `Needs review ${duration}`;
    if (tier === "queued") return `Queued ${duration}`;
    if (tier === "failed") return `Blocked ${duration}`;
    if (tier === "completed") return `Closed ${duration} ago`;
    return `Updated ${duration} ago`;
  }

  return "Timing unavailable";
}
