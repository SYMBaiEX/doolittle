import type { CodingVerificationReceipt } from "@doolittle/contracts";
import type { RunDepth, ToolProgressMode } from "@doolittle/contracts/run";

export type {
  LocalMutationInput,
  LocalMutationRecord,
  RunReceiptEnvelope,
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  RunUpdateType,
} from "@doolittle/contracts/run";

/** In-process-only context envelope. Never add this to snapshots or journals. */
export interface RuntimeCodingVerificationEvent {
  sessionId: string;
  runId: string;
  roomId: string;
  receipt: CodingVerificationReceipt;
}

export interface TaskRunEvent {
  id: number;
  runId: string;
  type: string;
  data: unknown;
  createdAt: string;
  terminal: boolean;
}

export interface TaskRunClaimInput {
  runId: string;
  sessionId: string;
  roomId: string;
  responseId: string;
  source: string;
}

export type TaskRunClaimResult =
  | { accepted: true }
  | {
      accepted: false;
      reason: "run_exists" | "session_active";
      conflictingRunId?: string;
    };

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
