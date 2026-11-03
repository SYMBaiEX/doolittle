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

/**
 * Forward-compatible receipt admitted from storage. Only the required envelope
 * fields are validated; nested evidence and all other recorded fields are unknown.
 * Recorded policy strings are evidence, never permission to select runtime policy.
 */
export interface RunReceiptEnvelope extends Record<string, unknown> {
  runId: string;
  sessionId: string;
  roomId: string;
  source: string;
  message: string;
  runDepth: string;
  configuredMaxIterations: number;
  observedActionCount: number;
  progressMode: string;
  status: RunStatus;
  localMutations: unknown[];
  pendingApprovals: number;
  startedAt: string;
  updatedAt: string;
}

/** Runtime-produced evidence. Client routing context belongs outside this record. */
export interface RunSnapshot extends RunReceiptEnvelope {
  runDepth: RunDepth;
  progressMode: ToolProgressMode;
  activeAction?: string;
  activeStream?: string;
  statusDetail?: string;
  lastAction?: string;
  localMutations: LocalMutationRecord[];
  walletActivities?: WalletActivityReceipt[];
  /** First operator-visible lifecycle update, used for queue-to-status telemetry. */
  firstStatusAt?: string;
  /** First model/message activity observed for this run. */
  firstMessageAt?: string;
  /** First tool/action activity observed for this run. */
  firstActionAt?: string;
  /** Most recent non-heartbeat activity. Heartbeats must not hide a stalled run. */
  lastMeaningfulActivityAt?: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  /** Final lifecycle outcome, retained after a run leaves the active session slot. */
  terminalReason?: RunTerminalReason;
  errorMessage?: string;
}

/**
 * Shallow receipt admission, preserving the existing persisted format's acceptance.
 * This does not validate a runtime snapshot, nested evidence, or execution policy.
 */
export function isRunReceiptEnvelope(
  value: unknown,
): value is RunReceiptEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    "runId" in value &&
    typeof value.runId === "string" &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "roomId" in value &&
    typeof value.roomId === "string" &&
    "source" in value &&
    typeof value.source === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "runDepth" in value &&
    typeof value.runDepth === "string" &&
    "configuredMaxIterations" in value &&
    typeof value.configuredMaxIterations === "number" &&
    "observedActionCount" in value &&
    typeof value.observedActionCount === "number" &&
    "progressMode" in value &&
    typeof value.progressMode === "string" &&
    "status" in value &&
    isRunStatus(value.status) &&
    "localMutations" in value &&
    Array.isArray(value.localMutations) &&
    "pendingApprovals" in value &&
    typeof value.pendingApprovals === "number" &&
    "startedAt" in value &&
    typeof value.startedAt === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string"
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
