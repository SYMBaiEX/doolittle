import type { WalletActivityReceipt } from "./wallet-activity";

/** Product execution depth; the runtime owns each depth's iteration policy. */
export const RUN_DEPTHS = ["quick", "standard", "deep", "explore"] as const;
export type RunDepth = (typeof RUN_DEPTHS)[number];

export const TOOL_PROGRESS_MODES = ["off", "new", "all", "verbose"] as const;
export type ToolProgressMode = (typeof TOOL_PROGRESS_MODES)[number];

export const ACTIVE_RUN_STATUSES = ["thinking", "acting", "waiting"] as const;
export type ActiveRunStatus = (typeof ACTIVE_RUN_STATUSES)[number];
export const TERMINAL_RUN_STATUSES = ["complete", "cancelled", "error"] as const;
export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];
export const RUN_STATUSES = [
  ...ACTIVE_RUN_STATUSES,
  ...TERMINAL_RUN_STATUSES,
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type RunTerminalReason = "completed" | "cancelled" | "error";

export function isActiveRunStatus(value: unknown): value is ActiveRunStatus {
  return (
    typeof value === "string" &&
    (ACTIVE_RUN_STATUSES as readonly string[]).includes(value)
  );
}

export function isTerminalRunStatus(
  value: unknown,
): value is TerminalRunStatus {
  return (
    typeof value === "string" &&
    (TERMINAL_RUN_STATUSES as readonly string[]).includes(value)
  );
}

export function isRunStatus(value: unknown): value is RunStatus {
  return isActiveRunStatus(value) || isTerminalRunStatus(value);
}

/** Serializable observation of a local action, not filesystem authority. */
export interface LocalMutationRecord {
  action: string;
  requestedPath?: string;
  resolvedPath?: string;
  success: boolean;
  message?: string;
  bytes?: number;
  replacements?: number;
  recordedAt: string;
}

export type LocalMutationInput = Omit<LocalMutationRecord, "recordedAt">;

/** Runtime-owned run evidence. Client routing context belongs outside this record. */
export interface RunSnapshot {
  runId: string;
  sessionId: string;
  roomId: string;
  source: string;
  message: string;
  runDepth: RunDepth;
  configuredMaxIterations: number;
  observedActionCount: number;
  progressMode: ToolProgressMode;
  status: RunStatus;
  activeAction?: string;
  activeStream?: string;
  statusDetail?: string;
  lastAction?: string;
  localMutations: LocalMutationRecord[];
  walletActivities?: WalletActivityReceipt[];
  pendingApprovals: number;
  startedAt: string;
  /** First operator-visible lifecycle update, used for queue-to-status telemetry. */
  firstStatusAt?: string;
  /** First model/message activity observed for this run. */
  firstMessageAt?: string;
  /** First tool/action activity observed for this run. */
  firstActionAt?: string;
  /** Most recent non-heartbeat activity. Heartbeats must not hide a stalled run. */
  lastMeaningfulActivityAt?: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  /** Final lifecycle outcome, retained after a run leaves the active session slot. */
  terminalReason?: RunTerminalReason;
  errorMessage?: string;
}

/**
 * Existing shallow receipt admission contract. Optional fields and nested action
 * records remain consumer-owned; this is not authorization or a deep validator.
 * Depth and progress strings retain the persisted format's forward compatibility.
 */
export function isRunSnapshot(value: unknown): value is RunSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as Partial<RunSnapshot>;
  return (
    typeof run.runId === "string" &&
    typeof run.sessionId === "string" &&
    typeof run.roomId === "string" &&
    typeof run.source === "string" &&
    typeof run.message === "string" &&
    typeof run.runDepth === "string" &&
    typeof run.configuredMaxIterations === "number" &&
    typeof run.observedActionCount === "number" &&
    typeof run.progressMode === "string" &&
    isRunStatus(run.status) &&
    Array.isArray(run.localMutations) &&
    typeof run.pendingApprovals === "number" &&
    typeof run.startedAt === "string" &&
    typeof run.updatedAt === "string"
  );
}

export const RUN_UPDATE_TYPES = [
  "started",
  "thinking",
  "acting",
  "waiting",
  "message",
  "action-started",
  "action-completed",
  "local-mutation",
  "stream",
  "heartbeat",
  "completed",
  "cancelled",
  "error",
  "approvals",
] as const;
export type RunUpdateType = (typeof RUN_UPDATE_TYPES)[number];

export interface RunUpdateEvent {
  type: RunUpdateType;
  sessionId: string;
  run: RunSnapshot;
}
