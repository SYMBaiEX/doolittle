import { existsSync } from "node:fs";

export interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resolveLocalShell(): string {
  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/sh"].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? "/bin/sh";
}

export const LOCAL_SHELL = resolveLocalShell();

function terminateSubprocess(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
  signal: string | number,
): void {
  const useProcessGroup = process.platform !== "win32";
  if (useProcessGroup && typeof proc.pid === "number") {
    try {
      process.kill(-proc.pid, signal as NodeJS.Signals);
      return;
    } catch {
      // Fall back to direct child termination below.
    }
  }
  try {
    proc.kill(signal as NodeJS.Signals | number);
  } catch {
    // Best effort only.
  }
}

export async function runCommand(
  cmd: string[],
  options: { cwd?: string; timeoutMs: number; abortSignal?: AbortSignal },
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });

  let timedOut = false;
  let aborted = options.abortSignal?.aborted === true;
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleForceKill = () => {
    if (forceKillTimer) {
      return;
    }
    forceKillTimer = setTimeout(() => {
      terminateSubprocess(proc, "SIGKILL");
    }, 250);
    forceKillTimer.unref?.();
  };
  const handleAbort = () => {
    aborted = true;
    terminateSubprocess(proc, "SIGINT");
    scheduleForceKill();
  };
  options.abortSignal?.addEventListener("abort", handleAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    terminateSubprocess(proc, "SIGTERM");
    scheduleForceKill();
  }, options.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const durationMs = Date.now() - startedAt;

    return {
      exitCode: timedOut ? 124 : aborted ? 130 : exitCode,
      stdout: stdout.trim(),
      stderr:
        stderr.trim() ||
        (timedOut
          ? `Command timed out after ${options.timeoutMs}ms (${durationMs}ms elapsed).`
          : aborted
            ? `Command cancelled after ${durationMs}ms.`
            : ""),
      timedOut,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    options.abortSignal?.removeEventListener("abort", handleAbort);
  }
}

export async function runCommandStreaming(
  cmd: string[],
  options: {
    cwd?: string;
    timeoutMs: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    abortSignal?: AbortSignal;
  },
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });

  let timedOut = false;
  let aborted = options.abortSignal?.aborted === true;
  let stdout = "";
  let stderr = "";
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleForceKill = () => {
    if (forceKillTimer) {
      return;
    }
    forceKillTimer = setTimeout(() => {
      terminateSubprocess(proc, "SIGKILL");
    }, 250);
    forceKillTimer.unref?.();
  };
  const handleAbort = () => {
    aborted = true;
    terminateSubprocess(proc, "SIGINT");
    scheduleForceKill();
  };
  options.abortSignal?.addEventListener("abort", handleAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    terminateSubprocess(proc, "SIGTERM");
    scheduleForceKill();
  }, options.timeoutMs);

  const readStream = async (
    stream: ReadableStream<Uint8Array> | null,
    onChunk?: (chunk: string) => void,
    sink?: (chunk: string) => void,
  ): Promise<void> => {
    if (!stream) {
      return;
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) {
          continue;
        }
        sink?.(chunk);
        onChunk?.(chunk);
      }
      const finalChunk = decoder.decode();
      if (finalChunk) {
        sink?.(finalChunk);
        onChunk?.(finalChunk);
      }
    } finally {
      reader.releaseLock();
    }
  };

  try {
    const [exitCode] = await Promise.all([
      proc.exited,
      readStream(proc.stdout, options.onStdout, (chunk) => {
        stdout += chunk;
      }),
      readStream(proc.stderr, options.onStderr, (chunk) => {
        stderr += chunk;
      }),
    ]);
    const durationMs = Date.now() - startedAt;
    return {
      exitCode: timedOut ? 124 : aborted ? 130 : exitCode,
      stdout: stdout.trim(),
      stderr:
        stderr.trim() ||
        (timedOut
          ? `Command timed out after ${options.timeoutMs}ms (${durationMs}ms elapsed).`
          : aborted
            ? `Command cancelled after ${durationMs}ms.`
            : ""),
      timedOut,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    options.abortSignal?.removeEventListener("abort", handleAbort);
  }
}

export function normalizeBackendError(
  result: TerminalRunResult,
): TerminalRunResult {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr:
      result.stderr ||
      (result.exitCode === 0 ? "" : "Command failed without stderr output."),
    timedOut: result.timedOut,
    durationMs: result.durationMs,
  };
}

export function sanitizeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command must not be empty.");
  }
  if (trimmed.includes("\u0000")) {
    throw new Error("Command contains unsupported NUL bytes.");
  }
  return trimmed;
}

export async function commandExists(
  binary: string,
  timeoutMs = 5_000,
): Promise<boolean> {
  const result = await runCommand(
    ["/bin/zsh", "-lc", `command -v ${shellQuote(binary)}`],
    {
      timeoutMs,
    },
  ).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
    timedOut: false,
    durationMs: 0,
  }));
  return result.exitCode === 0;
}
