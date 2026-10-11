import { randomUUID } from "node:crypto";

export interface CliState {
  activeSessionId: string;
  notices: Array<{
    kind: "context" | "skills" | "status";
    message: string;
    at: string;
  }>;
}

export interface CliExecutionResult {
  text: string;
  tone?: "info" | "success" | "warning" | "error" | "agent";
  shouldExit?: boolean;
  /** Authoritative terminal receipt, when an agent turn created a run. */
  status?: "completed" | "failed" | "cancelled";
}

export interface CliExecutionHooks {
  onStream?: (event: {
    source: "stdout" | "stderr";
    chunk: string;
    command: string;
  }) => void;
  onResponseProgress?: (event: { response: string }) => void | Promise<void>;
  onNotice?: (event: {
    kind: "context" | "skills" | "status";
    message: string;
  }) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

export interface CliPromptRunOptions {
  sessionId?: string;
  abortSignal?: AbortSignal;
  /** Internal JSON-stream-only eval channel; never enable for replayable jobs. */
  codingVerificationReceipts?: boolean;
}

/** Completion is an execution fact, not merely a resolved promise. */
export function getCliResultStatus(
  result: CliExecutionResult,
  abortSignal?: AbortSignal,
): "completed" | "failed" | "cancelled" {
  if (abortSignal?.aborted) return "cancelled";
  if (result.status) return result.status;
  if (result.shouldExit) return "cancelled";
  return result.tone === "error" ? "failed" : "completed";
}

export interface CliPromptEventHandlers {
  onEvent?: (
    event: import("@/cli/turn-events").CliTurnEvent,
  ) => void | Promise<void>;
}

export function createCliSessionId(prefix = "cli"): string {
  return `${prefix}:${randomUUID()}`;
}

export function getCliErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}
