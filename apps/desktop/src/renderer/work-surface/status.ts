export type WorkTier =
  | "active"
  | "pending"
  | "attention"
  | "done"
  | "failed"
  | "muted";

const TIERS: Record<string, WorkTier> = {
  // Active work
  running: "active",
  executing: "active",
  busy: "active",
  spawning: "active",
  in_progress: "active",
  processing: "active",
  active: "active",
  delivered: "active",
  // Waiting on the system
  pending: "pending",
  queued: "pending",
  draft: "pending",
  created: "pending",
  idle: "pending",
  scheduled: "pending",
  paused: "pending",
  waiting: "pending",
  // Needs a human or attention
  approval: "attention",
  review: "attention",
  blocked: "attention",
  waiting_approval: "attention",
  needs_review: "attention",
  stalled: "attention",
  retry: "attention",
  pairing: "attention",
  // Finished well
  completed: "done",
  done: "done",
  succeeded: "done",
  success: "done",
  end_turn: "done",
  passed: "done",
  approved: "done",
  resolved: "done",
  // Finished badly
  failed: "failed",
  error: "failed",
  errored: "failed",
  denied: "failed",
  rejected: "failed",
  timed_out: "failed",
  timeout: "failed",
  // Terminal without verdict
  cancelled: "muted",
  canceled: "muted",
  stopped: "muted",
  archived: "muted",
  skipped: "muted",
  expired: "muted",
};

export function statusTier(status: string | undefined | null): WorkTier {
  if (!status) return "muted";
  const key = status
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");
  return TIERS[key] ?? "pending";
}
