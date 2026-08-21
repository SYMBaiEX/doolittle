import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { StringDecoder } from "node:string_decoder";
import { sanitizeSpawnEnv } from "@elizaos/core";

export type ProviderCommandTermination = "exit" | "spawn_error" | "timeout";

export interface ProviderCommandRequest {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProviderCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  termination: ProviderCommandTermination;
}

const DEFAULT_PROVIDER_COMMAND_TIMEOUT_MS = 30_000;

function commandAbortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Provider command was cancelled.");
  error.name = "AbortError";
  return error;
}

function sanitizedEnvironment(
  overrides: Record<string, string | undefined> | undefined,
): NodeJS.ProcessEnv {
  if (!overrides) return process.env;
  return {
    ...process.env,
    ...sanitizeSpawnEnv(overrides),
  };
}

function killProcessTree(child: ChildProcess): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) {
      process.kill(-child.pid, "SIGKILL");
      return;
    }
  } catch {
    // The process may have exited between the close check and the kill.
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // The process is already gone.
  }
}

/**
 * Execute one provider CLI command without invoking a shell.
 *
 * This deliberately small runner is safe to publish independently of the
 * Eliza agent package: arguments are passed directly to `spawn`, dangerous
 * environment overrides use Eliza core's shared policy, child process groups
 * are terminated on deadline/cancellation, and stdout/stderr stay separate.
 */
export async function runProviderCommand(
  request: ProviderCommandRequest,
): Promise<ProviderCommandResult> {
  const command = request.command.trim();
  if (!command) {
    throw new TypeError("Provider command must not be empty.");
  }
  const timeoutMs = request.timeoutMs ?? DEFAULT_PROVIDER_COMMAND_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      "Provider command timeoutMs must be greater than zero.",
    );
  }
  if (request.signal?.aborted) {
    throw commandAbortReason(request.signal);
  }

  const startedAt = Date.now();
  return await new Promise<ProviderCommandResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command, [...request.args], {
        cwd: request.cwd,
        env: sanitizedEnvironment(request.env),
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        termination: "spawn_error",
      });
      return;
    }

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;

    const cleanup = () => {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    };
    const flushOutput = () => {
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
    };
    const onAbort = () => {
      cancelled = true;
      killProcessTree(child);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
    timer.unref?.();

    request.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += stdoutDecoder.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += stderrDecoder.write(chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      flushOutput();
      resolve({
        exitCode: -1,
        stdout,
        stderr: [stderr, error.message].filter(Boolean).join("\n"),
        durationMs: Date.now() - startedAt,
        termination: "spawn_error",
      });
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      flushOutput();
      if (cancelled && request.signal) {
        reject(commandAbortReason(request.signal));
        return;
      }
      if (timedOut) {
        const marker = `[provider-transport] command timed out after ${timeoutMs}ms`;
        resolve({
          exitCode: 124,
          stdout,
          stderr: `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}${marker}`,
          durationMs: Date.now() - startedAt,
          termination: "timeout",
        });
        return;
      }
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        termination: "exit",
      });
    });
  });
}
