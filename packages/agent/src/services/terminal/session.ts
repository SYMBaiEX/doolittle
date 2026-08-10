import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { type IPty, spawn as spawnPty } from "@lydell/node-pty";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "../workspace-directory";
import { LOCAL_SHELL } from "./execution/subprocess/shell";

const MAX_SESSIONS = 4;
const MAX_OUTPUT_BYTES = 1_000_000;
const MAX_INPUT_BYTES = 64_000;
const MIN_COLUMNS = 20;
const MAX_COLUMNS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;
const CLOSED_SESSION_RETENTION_MS = 10 * 60_000;

export type InteractiveTerminalSessionState = "running" | "exited" | "closed";

export interface InteractiveTerminalSessionSnapshot {
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
  session: InteractiveTerminalSessionSnapshot;
  chunks: InteractiveTerminalOutputChunk[];
  nextCursor: number;
  truncatedBeforeCursor: boolean;
}

interface InteractiveTerminalSessionRecord {
  snapshot: InteractiveTerminalSessionSnapshot;
  terminal: IPty;
  chunks: InteractiveTerminalOutputChunk[];
  nextCursor: number;
  outputBytes: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

function boundedDimension(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function terminalCommand(): string[] {
  if (process.platform === "win32") {
    return [process.env.ComSpec?.trim() || "cmd.exe", "/Q"];
  }
  return [LOCAL_SHELL, "-l"];
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function takeUtf8Suffix(value: string, maximumBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maximumBytes) return value;
  return new TextDecoder().decode(bytes.slice(bytes.byteLength - maximumBytes));
}

function validateSessionId(value: string): string {
  const id = value.trim();
  if (!/^[a-f0-9-]{36}$/u.test(id)) {
    throw new Error("A valid terminal session id is required.");
  }
  return id;
}

function validateInput(value: string): string {
  if (!value || utf8Bytes(value) > MAX_INPUT_BYTES) {
    throw new Error(
      `Terminal input must contain from 1 to ${MAX_INPUT_BYTES.toLocaleString()} UTF-8 bytes.`,
    );
  }
  return value;
}

export class InteractiveTerminalSessionManager {
  private readonly sessions = new Map<
    string,
    InteractiveTerminalSessionRecord
  >();

  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {}

  start(options?: {
    cols?: number;
    rows?: number;
  }): InteractiveTerminalSessionSnapshot {
    const running = [...this.sessions.values()].filter(
      (session) => session.snapshot.state === "running",
    );
    if (running.length >= MAX_SESSIONS) {
      throw new Error(
        `At most ${MAX_SESSIONS} interactive terminal sessions may run at once.`,
      );
    }

    const id = randomUUID();
    const cols = boundedDimension(options?.cols, 100, MIN_COLUMNS, MAX_COLUMNS);
    const rows = boundedDimension(options?.rows, 30, MIN_ROWS, MAX_ROWS);
    const command = terminalCommand();
    const workspaceDir = resolveWorkspaceDirectory(this.workspaceDirectory);
    const terminal = spawnPty(command[0] ?? "", command.slice(1), {
      cwd: workspaceDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        DOOLITTLE_DESKTOP_TERMINAL: "1",
      },
      name: "xterm-256color",
      cols,
      rows,
    });
    const pendingOutput: string[] = [];
    let record: InteractiveTerminalSessionRecord | undefined;
    const consume = (text: string) => {
      if (!record) {
        pendingOutput.push(text);
        return;
      }
      this.appendOutput(record, text);
    };
    terminal.onData(consume);

    const snapshot: InteractiveTerminalSessionSnapshot = {
      id,
      state: "running",
      cwd: workspaceDir,
      shell: basename(command[0] ?? "shell"),
      cols,
      rows,
      startedAt: new Date().toISOString(),
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    record = {
      snapshot,
      terminal,
      chunks: [],
      nextCursor: 0,
      outputBytes: 0,
    };
    this.sessions.set(id, record);
    for (const text of pendingOutput) {
      this.appendOutput(record, text);
    }

    terminal.onExit(({ exitCode }) => {
      this.finalize(record as InteractiveTerminalSessionRecord, exitCode);
    });
    return { ...snapshot };
  }

  input(sessionId: string, data: string): InteractiveTerminalSessionSnapshot {
    const record = this.requireRunning(sessionId);
    record.terminal.write(validateInput(data));
    return { ...record.snapshot };
  }

  resize(
    sessionId: string,
    colsValue: number,
    rowsValue: number,
  ): InteractiveTerminalSessionSnapshot {
    const record = this.requireRunning(sessionId);
    const cols = boundedDimension(
      colsValue,
      record.snapshot.cols,
      MIN_COLUMNS,
      MAX_COLUMNS,
    );
    const rows = boundedDimension(
      rowsValue,
      record.snapshot.rows,
      MIN_ROWS,
      MAX_ROWS,
    );
    record.snapshot.cols = cols;
    record.snapshot.rows = rows;
    record.terminal.resize(cols, rows);
    return { ...record.snapshot };
  }

  interrupt(sessionId: string): InteractiveTerminalSessionSnapshot {
    const record = this.requireRunning(sessionId);
    record.terminal.write("\u0003");
    return { ...record.snapshot };
  }

  close(sessionId: string): InteractiveTerminalSessionSnapshot {
    const record = this.requireSession(sessionId);
    if (record.snapshot.state !== "running") {
      return { ...record.snapshot };
    }
    record.snapshot.state = "closed";
    record.snapshot.completedAt = new Date().toISOString();
    try {
      record.terminal.write("exit\r");
    } catch {
      // The PTY may already be draining after process exit.
    }
    const killTimer = setTimeout(() => {
      try {
        record.terminal.kill();
      } catch {
        // Best effort only.
      }
    }, 250);
    killTimer.unref?.();
    this.scheduleCleanup(record);
    return { ...record.snapshot };
  }

  output(sessionId: string, cursor = 0): InteractiveTerminalOutput {
    const record = this.requireSession(sessionId);
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    const firstCursor = record.chunks.at(0)?.cursor ?? record.nextCursor + 1;
    return {
      session: { ...record.snapshot },
      chunks: record.chunks
        .filter((chunk) => chunk.cursor > safeCursor)
        .map((chunk) => ({ ...chunk })),
      nextCursor: record.nextCursor,
      truncatedBeforeCursor:
        safeCursor > 0 && safeCursor < Math.max(0, firstCursor - 1),
    };
  }

  dispose(): void {
    for (const record of this.sessions.values()) {
      if (record.cleanupTimer) clearTimeout(record.cleanupTimer);
      if (record.snapshot.state === "running") {
        try {
          record.terminal.kill();
        } catch {
          // Best effort only.
        }
      }
    }
    this.sessions.clear();
  }

  private requireSession(sessionId: string): InteractiveTerminalSessionRecord {
    const id = validateSessionId(sessionId);
    const record = this.sessions.get(id);
    if (!record) {
      throw new Error("Interactive terminal session was not found.");
    }
    return record;
  }

  private requireRunning(sessionId: string): InteractiveTerminalSessionRecord {
    const record = this.requireSession(sessionId);
    if (record.snapshot.state !== "running") {
      throw new Error("Interactive terminal session is no longer running.");
    }
    return record;
  }

  private appendOutput(
    record: InteractiveTerminalSessionRecord,
    value: string,
  ): void {
    if (!value) return;
    const data = takeUtf8Suffix(value, MAX_OUTPUT_BYTES);
    const byteLength = utf8Bytes(data);
    record.nextCursor += 1;
    record.chunks.push({ cursor: record.nextCursor, data });
    record.outputBytes += byteLength;

    while (record.outputBytes > MAX_OUTPUT_BYTES && record.chunks.length > 1) {
      const removed = record.chunks.shift();
      if (removed) record.outputBytes -= utf8Bytes(removed.data);
    }
    record.snapshot.outputBytes = record.outputBytes;
  }

  private finalize(
    record: InteractiveTerminalSessionRecord,
    exitCode: number,
  ): void {
    if (record.snapshot.state === "running") {
      record.snapshot.state = "exited";
      record.snapshot.completedAt = new Date().toISOString();
    }
    record.snapshot.exitCode = exitCode;
    this.scheduleCleanup(record);
  }

  private scheduleCleanup(record: InteractiveTerminalSessionRecord): void {
    if (record.cleanupTimer) return;
    record.cleanupTimer = setTimeout(() => {
      this.sessions.delete(record.snapshot.id);
    }, CLOSED_SESSION_RETENTION_MS);
    record.cleanupTimer.unref?.();
  }
}
