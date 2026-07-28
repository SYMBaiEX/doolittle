import type { DelegationTaskRecord } from "@/types";
import type {
  NativeAgentOrchestratorService,
  NativeOrchestratorTaskDetail,
  NativeOrchestratorTaskStatus,
  NativeOrchestratorTaskThread,
  RuntimeLike,
} from "../runtime-contracts";
import { ORCHESTRATOR_TASK_SERVICE } from "../runtime-contracts";

const TERMINAL_SESSION_STATUSES = new Set([
  "completed",
  "stopped",
  "errored",
  "cancelled",
]);

export class DelegationServiceUnavailableError extends Error {
  readonly code = "ORCHESTRATOR_TASK_SERVICE_UNAVAILABLE";

  constructor() {
    super(
      `${ORCHESTRATOR_TASK_SERVICE} is unavailable. Delegation requires @elizaos/plugin-agent-orchestrator.`,
    );
    this.name = "DelegationServiceUnavailableError";
  }
}

export function getOfficialOrchestrator(
  runtime: RuntimeLike,
): NativeAgentOrchestratorService | undefined {
  if (typeof runtime.getService !== "function") return undefined;
  return (
    (runtime.getService(
      ORCHESTRATOR_TASK_SERVICE,
    ) as NativeAgentOrchestratorService | null) ?? undefined
  );
}

export function requireOfficialOrchestrator(
  runtime: RuntimeLike,
): NativeAgentOrchestratorService {
  const service = getOfficialOrchestrator(runtime);
  if (!service) {
    throw new DelegationServiceUnavailableError();
  }
  return service;
}

export function updateDelegationProjection(
  services: unknown,
  tasks: readonly DelegationTaskRecord[],
): void {
  const delegation = (
    services as {
      delegation?: {
        replaceProjection?: (items: readonly DelegationTaskRecord[]) => void;
      };
    }
  )?.delegation;
  delegation?.replaceProjection?.(tasks);
}

export function upsertDelegationProjection(
  services: unknown,
  task: DelegationTaskRecord,
): DelegationTaskRecord {
  const delegation = (
    services as {
      delegation?: {
        upsertProjection?: (item: DelegationTaskRecord) => void;
      };
    }
  )?.delegation;
  delegation?.upsertProjection?.(task);
  return task;
}

function stringMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function metadataStrings(
  metadata: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = metadata[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return strings.length ? strings : undefined;
}

export function projectOfficialStatus(
  status: NativeOrchestratorTaskStatus,
  paused = false,
): DelegationTaskRecord["status"] {
  if (status === "done") return "completed";
  if (status === "failed") return "failed";
  if (status === "archived" || status === "interrupted") return "cancelled";
  if (status === "open") return "pending";
  return paused ? "pending" : "running";
}

export function projectOfficialTask(
  task: NativeOrchestratorTaskThread | NativeOrchestratorTaskDetail,
): DelegationTaskRecord {
  const detail =
    "goal" in task ? (task as NativeOrchestratorTaskDetail) : undefined;
  const metadata = detail?.metadata ?? {};
  const sessions = detail?.sessions ?? [];
  const latestSession = sessions.at(-1);
  const notes = detail
    ? [
        ...detail.messages
          .filter((message) => message.senderKind !== "user")
          .map((message) => `${message.senderKind}: ${message.content}`),
        ...detail.events.map(
          (event) => `system: ${event.eventType} ${event.summary}`,
        ),
      ]
    : task.summary
      ? [task.summary]
      : [];
  const tags =
    metadataStrings(metadata, "tags") ?? metadataStrings(metadata, "labels");
  const activeSession = sessions.find(
    (session) => !TERMINAL_SESSION_STATUSES.has(session.status),
  );

  return {
    id: task.id,
    title: task.title,
    objective: detail?.goal ?? task.originalRequest,
    group: metadataString(metadata, "group"),
    profile:
      metadataString(metadata, "profile") ??
      detail?.providerPolicy?.preferredFramework,
    priority: task.priority === "urgent" ? "high" : task.priority,
    tags,
    labels: tags,
    metadata: stringMetadata(metadata),
    workspaceRoot:
      latestSession?.workdir ??
      task.latestWorkdir ??
      metadataString(metadata, "workspaceRoot"),
    parentTaskId: detail?.parentTaskId ?? undefined,
    status: projectOfficialStatus(task.status, task.paused),
    executionMode: "delegated",
    workerMode: task.sessionCount > 0 ? "process" : undefined,
    attempts:
      typeof metadata.autoVerifyAttempts === "number"
        ? metadata.autoVerifyAttempts
        : task.sessionCount,
    maxAttempts:
      typeof metadata.maxAttempts === "number"
        ? metadata.maxAttempts
        : undefined,
    startedAt: activeSession ? task.updatedAt : undefined,
    notes,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.closedAt ?? undefined,
  };
}

export function projectOfficialTaskList(
  tasks: NativeOrchestratorTaskDetail[],
): DelegationTaskRecord[] {
  const projected = tasks.map(projectOfficialTask);
  const children = new Map<string, string[]>();
  for (const task of projected) {
    if (!task.parentTaskId) continue;
    const ids = children.get(task.parentTaskId) ?? [];
    ids.push(task.id);
    children.set(task.parentTaskId, ids);
  }
  return projected.map((task) => ({
    ...task,
    childTaskIds: children.get(task.id),
  }));
}
