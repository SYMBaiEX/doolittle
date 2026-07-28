import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { readProcessStream } from "./streaming";
import type {
  TerminalRunOptions,
  TerminalRunResult,
  TerminalStreamingRunOptions,
} from "./types";

type TerminalSubprocess = ChildProcessByStdio<null, Readable, Readable>;

interface ProcessTerminationState {
  timedOut: boolean;
  aborted: boolean;
}

function terminateSubprocess(
  proc: TerminalSubprocess,
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

function spawnSubprocess(cmd: string[], cwd?: string): TerminalSubprocess {
  return spawn(cmd[0] ?? "", cmd.slice(1), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
}

function waitForSubprocess(proc: TerminalSubprocess): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code) => resolve(code ?? 1));
  });
}

function createProcessTerminationControl(
  proc: TerminalSubprocess,
  options: TerminalRunOptions,
): {
  state: ProcessTerminationState;
  cleanup: () => void;
} {
  const state: ProcessTerminationState = {
    timedOut: false,
    aborted: options.abortSignal?.aborted === true,
  };

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
    state.aborted = true;
    terminateSubprocess(proc, "SIGINT");
    scheduleForceKill();
  };

  options.abortSignal?.addEventListener("abort", handleAbort, { once: true });

  const timer = setTimeout(() => {
    state.timedOut = true;
    terminateSubprocess(proc, "SIGTERM");
    scheduleForceKill();
  }, options.timeoutMs);

  return {
    state,
    cleanup: () => {
      clearTimeout(timer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      options.abortSignal?.removeEventListener("abort", handleAbort);
    },
  };
}

function finalizeRunResult(
  exitCode: number,
  stdout: string,
  stderr: string,
  startedAt: number,
  timeoutMs: number,
  state: ProcessTerminationState,
): TerminalRunResult {
  const durationMs = Date.now() - startedAt;
  return {
    exitCode: state.timedOut ? 124 : state.aborted ? 130 : exitCode,
    stdout: stdout.trim(),
    stderr:
      stderr.trim() ||
      (state.timedOut
        ? `Command timed out after ${timeoutMs}ms (${durationMs}ms elapsed).`
        : state.aborted
          ? `Command cancelled after ${durationMs}ms.`
          : ""),
    timedOut: state.timedOut,
    durationMs,
  };
}

export async function runCommand(
  cmd: string[],
  options: TerminalRunOptions,
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = spawnSubprocess(cmd, options.cwd);
  const control = createProcessTerminationControl(proc, options);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(ReadableStreamFrom(proc.stdout)).text(),
      new Response(ReadableStreamFrom(proc.stderr)).text(),
      waitForSubprocess(proc),
    ]);

    return finalizeRunResult(
      exitCode,
      stdout,
      stderr,
      startedAt,
      options.timeoutMs,
      control.state,
    );
  } finally {
    control.cleanup();
  }
}

export async function runCommandStreaming(
  cmd: string[],
  options: TerminalStreamingRunOptions,
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = spawnSubprocess(cmd, options.cwd);
  const control = createProcessTerminationControl(proc, options);
  let stdout = "";
  let stderr = "";

  try {
    const [exitCode] = await Promise.all([
      waitForSubprocess(proc),
      readProcessStream(proc.stdout, {
        onChunk: options.onStdout,
        collect: (chunk) => {
          stdout += chunk;
        },
      }),
      readProcessStream(proc.stderr, {
        onChunk: options.onStderr,
        collect: (chunk) => {
          stderr += chunk;
        },
      }),
    ]);

    return finalizeRunResult(
      exitCode,
      stdout,
      stderr,
      startedAt,
      options.timeoutMs,
      control.state,
    );
  } finally {
    control.cleanup();
  }
}

function ReadableStreamFrom(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(
          typeof chunk === "string" ? Buffer.from(chunk) : chunk,
        );
      });
      stream.once("end", () => controller.close());
      stream.once("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
}
