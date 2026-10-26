import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { StringDecoder } from "node:string_decoder";
import { sanitizeSpawnEnv } from "@elizaos/core";

export type ProviderCommandTermination =
  | "exit"
  | "spawn_error"
  | "timeout"
  | "output_limit";

export interface ProviderCommandRequest {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Combined stdout/stderr capture budget; defaults to 8 MiB. */
  maxOutputBytes?: number;
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

  const maxOutputBytes = request.maxOutputBytes ?? 8 * 1024 * 1024;
  if (
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes <= 0 ||
    maxOutputBytes > 64 * 1024 * 1024
  ) {
    throw new RangeError(
      "Provider command maxOutputBytes must be an integer between 1 and 64 MiB.",
    );
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
    let outputExceeded = false;
    let outputBytes = 0;

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
    const capture = (chunk: Buffer, decoder: StringDecoder): string => {
      if (outputExceeded) return "";
      const remaining = maxOutputBytes - outputBytes;
      const accepted = chunk.subarray(0, remaining);
      outputBytes += accepted.byteLength;
      if (chunk.byteLength > remaining) {
        outputExceeded = true;
        killProcessTree(child);
      }
      return decoder.write(accepted);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += capture(chunk, stdoutDecoder);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += capture(chunk, stderrDecoder);
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
      if (outputExceeded) {
        resolve({
          exitCode: 125,
          stdout,
          stderr: `${stderr}\n[provider-transport] combined output exceeded ${maxOutputBytes} bytes`,
          durationMs: Date.now() - startedAt,
          termination: "output_limit",
        });
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
