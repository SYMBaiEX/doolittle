const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const STALE_APPROVAL_AFTER_MS = 5 * MINUTE_MS;

export const APPROVAL_WAIT_REFRESH_MS = 5 * SECOND_MS;

export type ApprovalWaitTone = "fresh" | "waiting" | "stale";

export interface ApprovalWaitSnapshot {
  elapsedMs: number;
  remainingMs?: number;
  tone: ApprovalWaitTone;
  elapsedText: string;
  waitingText: string;
  expiryText?: string;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

export function formatApprovalWaitDuration(ms: number): string {
  const elapsed = Math.max(0, ms);
  if (elapsed < MINUTE_MS) {
    return `${Math.max(1, Math.floor(elapsed / SECOND_MS))}s`;
  }
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 24) {
    const remainingMinutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  const remainingHours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

/** Derive waiting state only from timestamps the approval record honestly carries. */
export function approvalWaitSnapshot(
  createdAt: unknown,
  expiresAt: unknown,
  nowMs: number,
): ApprovalWaitSnapshot | undefined {
  const createdMs = timestampMs(createdAt);
  if (createdMs === undefined || !Number.isFinite(nowMs)) return undefined;
  const elapsedMs = Math.max(0, nowMs - createdMs);
  const expiresMs = timestampMs(expiresAt);
  const remainingMs = expiresMs === undefined ? undefined : expiresMs - nowMs;
  const elapsedText = formatApprovalWaitDuration(elapsedMs);
  return {
    elapsedMs,
    remainingMs,
    tone:
      elapsedMs >= STALE_APPROVAL_AFTER_MS
        ? "stale"
        : elapsedMs >= MINUTE_MS
          ? "waiting"
          : "fresh",
    elapsedText,
    waitingText: `Waiting ${elapsedText}`,
    expiryText:
      remainingMs === undefined
        ? undefined
        : remainingMs > 0
          ? `expires in ${formatApprovalWaitDuration(remainingMs)}`
          : "expiry due",
  };
}
