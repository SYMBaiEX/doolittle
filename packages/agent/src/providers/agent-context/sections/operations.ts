import type { AppServices } from "@/services";

interface CronJobRecord {
  name: string;
  status: string;
  nextRunAt?: string | null;
}

interface EnabledTool {
  id: string;
  description: string;
}

interface DelegationTask {
  title: string;
  status: string;
}

type DelegationOverview = ReturnType<AppServices["delegation"]["overview"]>;

interface DelegationWorker {
  title: string;
  status: string;
  alive: boolean;
  stalled: boolean;
  attempts: number;
  maxAttempts: number;
}

interface UserProfileEntry {
  displayName?: string | null;
  userId: string;
  preferences: unknown[];
  facts: unknown[];
  notes: unknown[];
}

interface OperationsSectionsInput {
  cronJobs: CronJobRecord[];
  enabledTools: EnabledTool[];
  delegationTasks: DelegationTask[];
  delegationOverview: DelegationOverview | undefined;
  delegationWorkers: DelegationWorker[];
  userProfileEntries: UserProfileEntry[];
}

function formatDelegationOverview(overview: DelegationOverview): string {
  return [
    `total=${overview.total} pending=${overview.pending} running=${overview.running} completed=${overview.completed} failed=${overview.failed} cancelled=${overview.cancelled}`,
    `workers active=${overview.activeWorkers} alive=${overview.aliveWorkers} stalled=${overview.stalledWorkers} concurrency=${overview.concurrency}`,
    overview.byProfile.length
      ? `profiles=${overview.byProfile
          .slice(0, 4)
          .map((entry) => `${entry.profile}:${entry.count}`)
          .join(", ")}`
      : undefined,
    overview.byPriority.length
      ? `priority=${overview.byPriority
          .slice(0, 4)
          .map((entry) => `${entry.priority}:${entry.count}`)
          .join(", ")}`
      : undefined,
    overview.byOrchestration.length
      ? `orchestration=${overview.byOrchestration
          .slice(0, 4)
          .map((entry) => `${entry.mode}:${entry.count}`)
          .join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderOperationSections({
  cronJobs,
  enabledTools,
  delegationTasks,
  delegationOverview,
  delegationWorkers,
  userProfileEntries,
}: OperationsSectionsInput): string[] {
  const cronSummary = cronJobs
    .slice(0, 5)
    .map(
      (job) => `- ${job.name} [${job.status}] next=${job.nextRunAt ?? "n/a"}`,
    )
    .join("\n");

  const toolsSummary = enabledTools
    .slice(0, 6)
    .map((tool) => `- ${tool.id}: ${tool.description}`)
    .join("\n");

  const delegationSummary = delegationTasks
    .slice(0, 4)
    .map((task) => `- ${task.title} [${task.status}]`)
    .join("\n");

  const delegationWorkersSummary = delegationWorkers
    .map(
      (worker) =>
        `- ${worker.title} [${worker.status}] alive=${worker.alive} stalled=${worker.stalled} attempts=${worker.attempts}/${worker.maxAttempts}`,
    )
    .join("\n");

  const userProfiles = userProfileEntries
    .slice(0, 4)
    .map(
      (profile) =>
        `- ${profile.displayName ?? profile.userId}: prefs=${profile.preferences.length} facts=${profile.facts.length} notes=${profile.notes.length}`,
    )
    .join("\n");

  return [
    "CRON JOBS",
    cronSummary || "(none)",
    "",
    "TOOLS",
    toolsSummary || "(none)",
    "",
    "DELEGATION TASKS",
    delegationSummary || "(none)",
    "",
    "DELEGATION OVERVIEW",
    delegationOverview
      ? formatDelegationOverview(delegationOverview)
      : "(none)",
    "",
    "DELEGATION WORKERS",
    delegationWorkersSummary || "(none)",
    "",
    "USER PROFILES",
    userProfiles || "(none)",
  ];
}
