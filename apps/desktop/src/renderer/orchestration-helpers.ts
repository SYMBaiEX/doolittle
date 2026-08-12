import { type DesktopPlatform, workspacePathsEqual } from "./workspace-path";

export type OrchestrationStatusTier =
  | "running"
  | "queued"
  | "approval"
  | "completed"
  | "failed"
  | "idle";

export type TaskCapability = "coding" | "research";

export function taskCapabilityLabel(
  capabilityProfile?: string,
  kind?: string,
): TaskCapability {
  return capabilityProfile?.trim().toLowerCase() === "research" ||
    kind?.trim().toLowerCase() === "research"
    ? "research"
    : "coding";
}

export function taskExecutionLabel(executionMode?: string): string {
  return executionMode?.trim().toLowerCase() === "delegated"
    ? "delegated session"
    : "local runtime";
}

export function taskCreatePayload(input: {
  title: string;
  objective: string;
  capability: TaskCapability;
  profile?: string;
  framework?: string;
  accountId?: string;
  sessionId?: string;
  group?: string;
  priority?: string;
  executionMode?: string;
  workspaceRoot?: string;
}): Record<string, string | undefined> {
  const optional = (value?: string) => value?.trim() || undefined;
  const profile = optional(input.profile) ?? input.capability;
  return {
    title: input.title.trim(),
    objective: input.objective.trim(),
    // profile is retained for older runtimes; the canonical fields drive new ones.
    profile,
    capabilityProfile: input.capability,
    kind: input.capability,
    framework: optional(input.framework),
    accountId: optional(input.accountId),
    sessionId: optional(input.sessionId),
    group: optional(input.group),
    priority: optional(input.priority),
    executionMode: optional(input.executionMode),
    workspaceRoot: optional(input.workspaceRoot),
  };
}

/** Build a child-task spawn payload without copying receipt attribution fields. */
export function taskSpawnPayload(input: {
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  capabilityProfile?: string;
  kind?: string;
  framework?: string;
  executionMode?: string;
  workspaceRoot?: string;
}): Record<string, string | undefined> {
  const optional = (value?: string) => value?.trim() || undefined;
  return {
    title: input.title.trim() || "Child task",
    objective: input.objective.trim(),
    group: optional(input.group),
    profile: optional(input.profile),
    capabilityProfile: optional(input.capabilityProfile),
    kind: optional(input.kind),
    framework: optional(input.framework),
    executionMode: optional(input.executionMode),
    workspaceRoot: optional(input.workspaceRoot),
  };
}

export function scopeTasksByWorkspace<T extends { workspaceRoot?: string }>(
  tasks: T[],
  options: {
    scope: string;
    workspacePath?: string;
    platform: DesktopPlatform;
  },
): T[] {
  if (options.scope === "all") return tasks;
  if (options.scope === "unscoped") {
    return tasks.filter((task) => !task.workspaceRoot?.trim());
  }
  if (!options.workspacePath?.trim()) return [];
  return tasks.filter(
    (task) =>
      Boolean(task.workspaceRoot?.trim()) &&
      workspacePathsEqual(
        task.workspaceRoot,
        options.workspacePath ?? "",
        options.platform,
      ),
  );
}

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

export function summarizeScopedTaskOverview(
  tasks: ReadonlyArray<{ status?: string }>,
): {
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
} {
  return tasks.reduce(
    (summary, task) => {
      const tier = orchestrationStatusTier(task.status);
      summary.total += 1;
      if (tier === "running") summary.running += 1;
      if (tier === "queued" || tier === "approval") summary.pending += 1;
      if (tier === "completed") summary.completed += 1;
      if (tier === "failed") summary.failed += 1;
      return summary;
    },
    { total: 0, running: 0, pending: 0, completed: 0, failed: 0 },
  );
}

export function projectScopedOrchestrationOverview(input: {
  projectScope: string;
  tasks: ReadonlyArray<{ status?: string }>;
  globalOverview: Record<string, unknown>;
}): Record<string, unknown> {
  if (input.projectScope === "all") return input.globalOverview;
  // Project views must never borrow global counts while the queue resource is
  // intentionally deferred on another tab. An empty scoped summary is more
  // truthful than presenting work from unrelated repositories as local work.
  return summarizeScopedTaskOverview(input.tasks);
}

export function shouldShowOrchestrationSummary(input: {
  queued: number;
  running: number;
  approval: number;
  completed: number;
}): boolean {
  return Object.values(input).some(
    (value) => Number.isFinite(value) && value > 0,
  );
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
