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
