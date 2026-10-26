import { type ChildProcess, execFile, spawn } from "node:child_process";
import { win32 } from "node:path";
import process from "node:process";
import { StringDecoder } from "node:string_decoder";
import { sanitizeSpawnEnv } from "@elizaos/core";

export type ProviderCommandTermination =
  | "exit"
  | "spawn_error"
  | "timeout"
  | "output_limit"
  | "termination_error";

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

async function killProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    const configuredRoot =
      process.env.SystemRoot?.trim() || process.env.WINDIR?.trim();
    // Select a fixed system-tool location, never execute an environment-supplied path.
    const root = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      .split("")
      .map((drive) => `${drive}:\\Windows`)
      .find(
        (candidate) =>
          candidate.toLowerCase() ===
          win32
            .normalize(configuredRoot ?? "")
            .replace(/\\$/u, "")
            .toLowerCase(),
      );
    if (!root)
      throw new Error(
        "Windows SystemRoot must use the standard Windows directory on a local drive.",
      );
    await new Promise<void>((resolve, reject) => {
      execFile(
        win32.join(root, "System32", "taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"],
        { timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true },
        (error) =>
          error
            ? reject(
                new Error("Windows provider process-tree termination failed.", {
                  cause: error,
                }),
              )
            : resolve(),
      );
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
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
    let closed = false;
    let timedOut = false;
    let cancelled = false;
    let outputExceeded = false;
    let outputBytes = 0;
    let stopping: Promise<void> | undefined;
    let terminationFailure = false;

    const cleanup = () => {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    };
    const flushOutput = () => {
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
    };
    const stop = () => {
      if (stopping || settled) return;
      stopping = killProcessTree(child)
        .catch(() => {
          // A short command may close naturally while Windows taskkill starts.
          // Closed stdio needs no further drain; do not mislabel output overflow.
          if (closed) return;
          terminationFailure = true;
          // Best effort fallback; report that descendant termination was not verified.
          try {
            child.kill("SIGKILL");
          } catch {
            /* termination failure is reported below */
          }
        })
        .finally(() => {
          // A descendant retaining a pipe must not keep this request pending forever.
          child.stdout?.destroy();
          child.stderr?.destroy();
          finish(null);
        });
    };
    const onAbort = () => {
      cancelled = true;
      stop();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
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
        stop();
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
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      flushOutput();
      if (terminationFailure) {
        if (cancelled) {
          reject(
            new Error(
              "Provider cancellation could not terminate its process tree.",
            ),
          );
          return;
        }
        resolve({
          exitCode: 126,
          stdout,
          stderr: `${stderr}\n[provider-transport] process-tree termination failed`,
          durationMs: Date.now() - startedAt,
          termination: "termination_error",
        });
        return;
      }
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
    };
    child.once("close", (code) => {
      closed = true;
      if (!stopping) finish(code);
    });
    if (request.signal?.aborted) onAbort();
  });
}
