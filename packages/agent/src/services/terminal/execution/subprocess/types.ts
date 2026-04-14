export interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface TerminalRunOptions {
  cwd?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}

export interface TerminalStreamingRunOptions extends TerminalRunOptions {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}
