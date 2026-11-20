import type { ShellSandboxBackend } from "@elizaos/agent/services/shell-execution-router";

export interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  /** Transient provenance from the SDK shell router; never persisted. */
  sandbox?: ShellSandboxBackend;
}

export interface TerminalRunOptions {
  cwd?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  toolName?: string;
}
