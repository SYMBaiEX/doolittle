/**
 * User-authored input admitted into an active run at a pass boundary.
 *
 * Steer is not a queued next turn and never replaces or impersonates the
 * original user message. Acceptance means the runtime has durably persisted
 * the user's message and reserved continuation-pass capacity to present it to
 * the active run. Cancellation, abort, or a runtime failure can still end the
 * run before that pass; acceptance never claims the model will obey the input.
 */
export const CHAT_RUN_STEER_DELIVERY = "next-continuation-pass" as const;
export type ChatRunSteerDelivery = typeof CHAT_RUN_STEER_DELIVERY;

export const CHAT_RUN_STEER_REJECTION_CODES = [
  "empty_message",
  "run_not_active",
  "run_not_steerable",
  "session_mismatch",
  "user_mismatch",
  "steer_budget_exhausted",
  "steer_persistence_failed",
] as const;
export type ChatRunSteerRejectionCode =
  (typeof CHAT_RUN_STEER_REJECTION_CODES)[number];

export interface ChatRunSteerRequest {
  runId: string;
  message: string;
  userId?: string;
}

export interface ChatRunSteerAccepted {
  accepted: true;
  runId: string;
  sessionId: string;
  /** Durable user transcript memory id. */
  messageId: string;
  delivery: ChatRunSteerDelivery;
}

export interface ChatRunSteerRejected {
  accepted: false;
  code: ChatRunSteerRejectionCode;
  message: string;
}

export type ChatRunSteerSubmissionResult =
  | ChatRunSteerAccepted
  | ChatRunSteerRejected;

/** Runtime-internal ordered steer payload rendered into a continuation pass. */
export interface ChatRunSteerMessage {
  id: string;
  userId: string;
  text: string;
  /** Monotonic per-run admission order. */
  sequence: number;
  createdAt: string;
}
