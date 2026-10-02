import { spawn } from "node:child_process";

export interface HeadlessExecOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  killGraceMs?: number;
  maxBufferBytes?: number;
  /** Best-effort observer for accepted stdout chunks; never affects child success. */
  onStdoutChunk?: (chunk: Buffer) => void;
}

export interface HeadlessExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
  signal: NodeJS.Signals | null;
}

export type HeadlessExecutor = (
  command: string,
  args: string[],
  options: HeadlessExecOptions,
) => Promise<HeadlessExecResult> | HeadlessExecResult;

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_KILL_GRACE_MS = 1_000;
const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const FINAL_CLOSE_GRACE_MS = 1_000;

function processError(code: string, message: string): Error {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function signalProcessTree(
  pid: number | undefined,
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  if (process.platform === "win32" && pid !== undefined) {
    const treeKiller = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    treeKiller.on("error", () => child.kill(signal));
    treeKiller.unref();
    return;
  }

  if (process.platform !== "win32" && pid !== undefined) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall back to the direct child if process-group signalling is unavailable.
    }
  }

  child.kill(signal);
}

/**
 * Run one Doolittle CLI invocation with a wall-clock bound that also terminates
 * descendants. `spawnSync` cannot provide that guarantee: its timeout only
 * signals the direct child and it still waits for inherited pipes to close.
 */
export function executeHeadlessChild(
  command: string,
  args: string[],
  options: HeadlessExecOptions,
): Promise<HeadlessExecResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let failure: Error | undefined;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let finalTimer: NodeJS.Timeout | undefined;

    const cleanupTimers = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (finalTimer) clearTimeout(finalTimer);
    };

    const finish = (status: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        ...(failure ? { error: failure } : {}),
        signal,
      });
    };

    const kill = (error: Error) => {
      if (failure) return;
      failure = error;
      signalProcessTree(child.pid, child, "SIGTERM");
      killTimer = setTimeout(() => {
        signalProcessTree(child.pid, child, "SIGKILL");
        finalTimer = setTimeout(() => {
          child.stdout?.destroy();
          child.stderr?.destroy();
          finish(null, "SIGKILL");
        }, FINAL_CLOSE_GRACE_MS);
      }, killGraceMs);
    };

    const collect = (target: Buffer[], chunk: Buffer) => {
      if (failure) return;
      capturedBytes += chunk.byteLength;
      if (capturedBytes > maxBufferBytes) {
        kill(
          processError(
            "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
            `Headless eval child output exceeded ${maxBufferBytes} bytes.`,
          ),
        );
        return;
      }
      target.push(chunk);
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const previousCapturedBytes = capturedBytes;
      collect(stdout, buffer);
      if (failure || capturedBytes === previousCapturedBytes) return;
      try {
        options.onStdoutChunk?.(buffer);
      } catch {
        // Telemetry must not affect task execution.
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) =>
      collect(stderr, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    child.on("error", (error) => {
      if (!failure) failure = error;
    });
    child.on("close", (status, signal) =>
      finish(status, signal as NodeJS.Signals | null),
    );

    const timeoutTimer = setTimeout(() => {
      kill(
        processError(
          "ETIMEDOUT",
          `Headless eval child exceeded its ${timeoutMs}ms execution limit.`,
        ),
      );
    }, timeoutMs);
  });
}
