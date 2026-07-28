import { Worker } from "node:worker_threads";
import {
  resolveShellExecutionMode,
  runShell,
  type ShellResult,
} from "@elizaos/agent/services/shell-execution-router";

export interface TextProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  sandbox: ShellResult["sandbox"];
}

export interface TextProcessOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  abortSignal?: AbortSignal;
  toolName: string;
}

const SYNC_RESULT_BYTES = 2 * 1024 * 1024;

const PROCESS_ID_MARKER = "__DOOLITTLE_ROUTER_PID__";
const ABORT_WRAPPER_SCRIPT = `printf '${PROCESS_ID_MARKER}%s\\n' "$$" >&2
exec "$@"`;

function definedEnvironment(
  env: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

/**
 * Runs a one-shot argv command through the ElizaOS shell execution router.
 * Long-lived interactive sessions intentionally use their own PTY lifecycle.
 */
export async function runTextProcess(
  command: string,
  args: readonly string[],
  options: TextProcessOptions,
): Promise<TextProcessResult> {
  if (options.abortSignal?.aborted) {
    return {
      exitCode: 130,
      stdout: "",
      stderr: "Command cancelled before execution.",
      durationMs: 0,
      sandbox: "none",
    };
  }

  if (
    options.abortSignal &&
    resolveShellExecutionMode() === "local-yolo" &&
    process.platform !== "win32"
  ) {
    return runAbortableHostProcess(command, args, options);
  }

  return runShell({
    command,
    args,
    cwd: options.cwd,
    env: definedEnvironment(options.env),
    timeoutMs: options.timeoutMs,
    onStdout: options.onStdout,
    onStderr: options.onStderr,
    toolName: options.toolName,
  });
}

/** Runs a CLI command with terminal ownership while retaining router dispatch. */
export async function runInheritedTextProcess(
  command: string,
  args: readonly string[],
  options: Omit<TextProcessOptions, "onStdout" | "onStderr">,
): Promise<TextProcessResult> {
  if (
    process.platform !== "win32" &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.stderr.isTTY
  ) {
    return runTextProcess(
      "/bin/sh",
      [
        "-c",
        'exec "$@" </dev/tty >/dev/tty 2>/dev/tty',
        "doolittle-inherited-cli",
        command,
        ...args,
      ],
      options,
    );
  }
  return runTextProcess(command, args, {
    ...options,
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  });
}

/**
 * Compatibility bridge for pre-runtime synchronous callers. A worker thread
 * owns the async wait; the command itself still executes exclusively through
 * the SDK router.
 */
export function runTextProcessSync(
  command: string,
  args: readonly string[],
  options: Omit<TextProcessOptions, "onStdout" | "onStderr" | "abortSignal">,
): TextProcessResult {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const shared = new SharedArrayBuffer(SYNC_RESULT_BYTES);
  const state = new Int32Array(shared, 0, 2);
  const workerSource = `
    const { workerData } = require("node:worker_threads");
    const state = new Int32Array(workerData.shared, 0, 2);
    const bytes = new Uint8Array(workerData.shared, 8);
    (async () => {
      try {
        const { runShell } = await import("@elizaos/agent/services/shell-execution-router");
        const result = await runShell(workerData.request);
        const encoded = new TextEncoder().encode(JSON.stringify({ ok: true, result }));
        if (encoded.byteLength > bytes.byteLength) throw new Error("Synchronous shell result exceeded 2 MB.");
        bytes.set(encoded);
        Atomics.store(state, 1, encoded.byteLength);
        Atomics.store(state, 0, 1);
      } catch (error) {
        const encoded = new TextEncoder().encode(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));
        bytes.set(encoded.slice(0, bytes.byteLength));
        Atomics.store(state, 1, Math.min(encoded.byteLength, bytes.byteLength));
        Atomics.store(state, 0, 2);
      } finally {
        Atomics.notify(state, 0);
      }
    })();
  `;
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      shared,
      request: {
        command,
        args,
        cwd: options.cwd,
        env: definedEnvironment(options.env),
        timeoutMs,
        toolName: options.toolName,
      },
    },
  });
  const wait = Atomics.wait(state, 0, 0, timeoutMs + 2_000);
  void worker.terminate();
  if (wait === "timed-out") {
    throw new Error(`Synchronous shell bridge timed out after ${timeoutMs}ms.`);
  }
  const length = Atomics.load(state, 1);
  const payload = JSON.parse(
    new TextDecoder().decode(new Uint8Array(shared, 8, length)),
  ) as { ok: true; result: TextProcessResult } | { ok: false; error: string };
  if (!payload.ok) {
    throw new Error(payload.error);
  }
  return payload.result;
}

async function runAbortableHostProcess(
  command: string,
  args: readonly string[],
  options: TextProcessOptions,
): Promise<TextProcessResult> {
  let processGroupId: number | undefined;
  let aborted = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  let stderrPrefix = "";

  const killProcessGroup = (signal: NodeJS.Signals) => {
    if (processGroupId === undefined) return;
    try {
      process.kill(-processGroupId, signal);
    } catch {
      // The routed process may already have exited.
    }
  };
  const abort = () => {
    aborted = true;
    killProcessGroup("SIGINT");
    forceKillTimer = setTimeout(() => killProcessGroup("SIGKILL"), 250);
    forceKillTimer.unref?.();
  };
  const onStderr = (chunk: string) => {
    if (processGroupId !== undefined) {
      options.onStderr?.(chunk);
      return;
    }
    stderrPrefix += chunk;
    const newline = stderrPrefix.indexOf("\n");
    if (newline < 0) return;
    const firstLine = stderrPrefix.slice(0, newline);
    const parsedPid = Number.parseInt(
      firstLine.slice(PROCESS_ID_MARKER.length),
      10,
    );
    if (
      firstLine.startsWith(PROCESS_ID_MARKER) &&
      Number.isSafeInteger(parsedPid) &&
      parsedPid > 0
    ) {
      processGroupId = parsedPid;
      if (aborted) killProcessGroup("SIGINT");
      const remainder = stderrPrefix.slice(newline + 1);
      if (remainder) options.onStderr?.(remainder);
      stderrPrefix = "";
      return;
    }
    options.onStderr?.(stderrPrefix);
    stderrPrefix = "";
  };

  options.abortSignal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await runShell({
      command: "/bin/sh",
      args: ["-c", ABORT_WRAPPER_SCRIPT, "doolittle-router", command, ...args],
      cwd: options.cwd,
      env: definedEnvironment(options.env),
      timeoutMs: options.timeoutMs,
      onStdout: options.onStdout,
      onStderr,
      toolName: options.toolName,
    });
    const stderr = result.stderr.replace(
      new RegExp(`^${PROCESS_ID_MARKER}\\d+\\r?\\n?`, "u"),
      "",
    );
    return {
      ...result,
      exitCode: aborted ? 130 : result.exitCode,
      stderr:
        stderr ||
        (aborted ? "Command cancelled by operator." : stderrPrefix.trim()),
    };
  } finally {
    options.abortSignal?.removeEventListener("abort", abort);
    if (forceKillTimer) clearTimeout(forceKillTimer);
  }
}
