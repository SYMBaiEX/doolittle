import type { DesktopCommandRequest } from "./desktop";

export interface TerminalStreamRequest extends DesktopCommandRequest {
  requestId: string;
}
export interface TerminalStreamEvent {
  requestId: string;
  event:
    | "terminal.started"
    | "terminal.stdout"
    | "terminal.stderr"
    | "terminal.completed"
    | "terminal.cancelled"
    | "error";
  data: unknown;
}
export type InteractiveTerminalSessionState = "running" | "exited" | "closed";
export interface InteractiveTerminalSession {
  id: string;
  state: InteractiveTerminalSessionState;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  pty: boolean;
  supportsResize: boolean;
  outputBytes: number;
}
export interface InteractiveTerminalOutputChunk {
  cursor: number;
  data: string;
}
export interface InteractiveTerminalOutput {
  session: InteractiveTerminalSession;
  chunks: InteractiveTerminalOutputChunk[];
  nextCursor: number;
  truncatedBeforeCursor: boolean;
}
export interface InteractiveTerminalStartRequest {
  cols: number;
  rows: number;
}
export type InteractiveTerminalStartResult =
  | { status: "cancelled" }
  | { status: "started"; session: InteractiveTerminalSession };
export interface InteractiveTerminalInputRequest {
  sessionId: string;
  data: string;
}
export interface InteractiveTerminalResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}
