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
  /** Direct child/stdio closed and the owned POSIX group is absent. Not escaped groups or Windows trees. */
  cleanupSafe: boolean;
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
 * Bound one CLI invocation and clean its owned POSIX process group. Escaped
 * groups and Windows tree absence are not established by this contract.
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
    let checkTimer: NodeJS.Timeout | undefined;
    let stopping = false;
    let closed = false;
    let exitStatus: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;

    const cleanupTimers = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (finalTimer) clearTimeout(finalTimer);
      if (checkTimer) clearInterval(checkTimer);
    };

    const finish = (cleanupSafe: boolean) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      resolve({
        status: exitStatus,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        ...(failure ? { error: failure } : {}),
        signal: exitSignal,
        cleanupSafe,
      });
    };

    const groupAbsent = (): boolean => {
      // A failed spawn with no PID created no process group. A closed Windows
      // child, however, does not confirm that its descendants have exited.
      if (child.pid === undefined) return closed;
      if (process.platform === "win32") return false;
      try {
        process.kill(-child.pid, 0);
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    };
    const finishIfSafe = (): boolean => {
      if (!closed || !groupAbsent()) return false;
      finish(true);
      return true;
    };
    const kill = (error?: Error) => {
      if (error && !failure) failure = error;
      if (stopping || settled) return;
      stopping = true;
      clearTimeout(timeoutTimer);
      signalProcessTree(child.pid, child, "SIGTERM");
      checkTimer = setInterval(finishIfSafe, 25);
      killTimer = setTimeout(() => {
        if (finishIfSafe()) return;
        signalProcessTree(child.pid, child, "SIGKILL");
        finalTimer = setTimeout(() => {
          if (finishIfSafe()) return;
          failure ??= processError(
            "ERR_HEADLESS_CLEANUP_UNCONFIRMED",
            "Headless eval child cleanup could not be confirmed.",
          );
          child.stdout?.destroy();
          child.stderr?.destroy();
          finish(false);
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
    child.on("exit", (status, signal) => {
      exitStatus = status;
      exitSignal = signal as NodeJS.Signals | null;
      // Independent descendant stdio can make close happen immediately; or
      // inherited stdio can delay it indefinitely. Neither cancels escalation.
      if (!finishIfSafe()) kill();
    });
    child.on("close", (status, signal) => {
      closed = true;
      exitStatus = status;
      exitSignal = signal as NodeJS.Signals | null;
      if (!finishIfSafe()) kill();
    });

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
