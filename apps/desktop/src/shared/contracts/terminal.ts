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
  processId?: number;
  managed?: boolean;
  command?: string;
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
export type InteractiveTerminalOutputResult =
  | { status: "available"; output: InteractiveTerminalOutput }
  | { status: "absent"; sessionId: string }
  | {
      status: "unconfirmed";
      sessionId: string;
      retryable: boolean;
      message: string;
    };
export interface InteractiveTerminalStartRequest {
  /** Timestamp-prefixed UUID, stable for one tab's open attempt and retries. */
  requestId: string;
  /** Existing pending attempts may reconcile but must never activate a bot. */
  reconcileOnly?: boolean;
  botId?: string;
  originConversationId: string;
  workspacePath: string;
  cols: number;
  rows: number;
}
export type InteractiveTerminalStartResult =
  | { status: "started"; session: InteractiveTerminalSession }
  | {
      status: "unconfirmed";
      requestId: string;
      retryable: boolean;
      message: string;
    };
export interface InteractiveTerminalInputRequest {
  botId?: string;
  sessionId: string;
  data: string;
}
export interface InteractiveTerminalResizeRequest {
  botId?: string;
  sessionId: string;
  cols: number;
  rows: number;
}
