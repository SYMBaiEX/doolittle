import type { RunDepth, ToolProgressMode } from "@/types";

export type RunStatus =
  | "thinking"
  | "acting"
  | "waiting"
  | "complete"
  | "error";

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
  pendingApprovals: number;
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  errorMessage?: string;
}

export interface RunUpdateEvent {
  type:
    | "started"
    | "thinking"
    | "acting"
    | "waiting"
    | "message"
    | "action-started"
    | "action-completed"
    | "local-mutation"
    | "stream"
    | "heartbeat"
    | "completed"
    | "error"
    | "approvals";
  sessionId: string;
  run: RunSnapshot;
}

export type RunUpdateType = RunUpdateEvent["type"];

export interface StartTurnInput {
  sessionId: string;
  roomId: string;
  runId: string;
  source: string;
  message: string;
  runDepth: RunDepth;
  configuredMaxIterations: number;
  progressMode: ToolProgressMode;
  pendingApprovals?: number;
}
