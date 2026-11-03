import { Buffer } from "node:buffer";
import path from "node:path";
import type { ExecutionBackendCapabilities } from "@doolittle/contracts/execution";
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
  /** Refuse dispatch unless this adapter can attempt and confirm owned teardown. */
  requireOwnedCancellation?: boolean;
  toolName: string;
}

/** The SDK router does not currently expose abort handling outside local-yolo. */
export function textProcessCapabilities(): ExecutionBackendCapabilities {
  return { ownedCancellation: resolveShellExecutionMode() === "local-yolo" };
}

export class TextProcessCancellationUnavailableError extends Error {
  readonly code = "TEXT_PROCESS_CANCELLATION_UNAVAILABLE";

  constructor() {
    super(
      "The selected SDK execution policy cannot confirm owned process cancellation. Execution policy was not changed.",
    );
    this.name = "TextProcessCancellationUnavailableError";
  }
}

/** A teardown attempt failed to establish that the owned execution stopped. */
export class TextProcessTerminationUnconfirmedError extends Error {
  readonly code = "TEXT_PROCESS_TERMINATION_UNCONFIRMED";

  constructor(
    readonly detail: string,
    readonly result?: TextProcessResult,
  ) {
    super(
      `Command cancellation could not be confirmed; owned processes may still be running: ${detail}`,
    );
    this.name = "TextProcessTerminationUnconfirmedError";
  }
}

const CANCELLATION_GRACE_MS = 250;
const TERMINATION_CONFIRMATION_MS = 1_000;

/** These waits retain process ownership independently of the aborted request. */
function waitForTeardown(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processAbsent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ESRCH";
}

async function confirmProcessAbsent(id: number): Promise<string | undefined> {
  const deadline = Date.now() + TERMINATION_CONFIRMATION_MS;
  while (true) {
    try {
      process.kill(id, 0);
    } catch (error) {
      if (processAbsent(error)) return undefined;
      return `Process termination could not be inspected: ${boundedErrorMessage(error)}`;
    }
    if (Date.now() >= deadline) {
      return "The owned process or process group still exists after teardown.";
    }
    await waitForTeardown(25);
  }
}

async function terminateProcessGroup(
  groupId: number,
): Promise<string | undefined> {
  let signalFailure: string | undefined;
  try {
    process.kill(-groupId, "SIGINT");
  } catch (error) {
    if (processAbsent(error)) return undefined;
    signalFailure = `SIGINT failed: ${boundedErrorMessage(error)}`;
  }
  await waitForTeardown(CANCELLATION_GRACE_MS);
  try {
    process.kill(-groupId, "SIGKILL");
  } catch (error) {
    if (processAbsent(error)) return undefined;
    signalFailure = `SIGKILL failed: ${boundedErrorMessage(error)}`;
  }
  const confirmationFailure = await confirmProcessAbsent(-groupId);
  return confirmationFailure
    ? [signalFailure, confirmationFailure].filter(Boolean).join(" ")
    : undefined;
}

const PROCESS_ID_MARKER = "__DOOLITTLE_ROUTER_PID__";
const ABORT_WRAPPER_SCRIPT = `printf '${PROCESS_ID_MARKER}%s\\n' "$$" >&2
exec "$@"`;
function windowsAbortWrapperScript(
  command: string,
  args: readonly string[],
): string {
  const encodedArgv = Buffer.from(
    JSON.stringify({ command, args }),
    "utf8",
  ).toString("base64");
  return `
$payloadJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedArgv}'))
$payload = $payloadJson | ConvertFrom-Json
$target = [string]$payload.command
$targetArgs = @($payload.args | ForEach-Object { [string]$_ })
[Console]::Error.WriteLine('${PROCESS_ID_MARKER}' + $PID)
& $target @targetArgs
$invocationSucceeded = $?
$nativeExitCode = $LASTEXITCODE
if ($null -ne $nativeExitCode) { exit $nativeExitCode }
if ($invocationSucceeded) { exit 0 }
exit 1
`.trim();
}

function windowsSystemExecutable(...segments: string[]): string {
  const configuredRoot =
    process.env.SystemRoot?.trim() || process.env.WINDIR?.trim();
  if (
    !configuredRoot ||
    !path.win32.isAbsolute(configuredRoot) ||
    !/^[a-z]:\\/iu.test(configuredRoot)
  ) {
    throw new Error(
      "Windows system executables are unavailable because SystemRoot is invalid.",
    );
  }
  return path.win32.join(path.win32.normalize(configuredRoot), ...segments);
}

function boundedErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

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

  const capabilities = textProcessCapabilities();
  if (
    options.requireOwnedCancellation &&
    (!options.abortSignal || !capabilities.ownedCancellation)
  ) {
    throw new TextProcessCancellationUnavailableError();
  }

  if (options.abortSignal && capabilities.ownedCancellation) {
    if (process.platform === "win32") {
      return runAbortableWindowsHostProcess(command, args, options);
    }
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

async function runAbortableWindowsHostProcess(
  command: string,
  args: readonly string[],
  options: TextProcessOptions,
): Promise<TextProcessResult> {
  const powershellExecutable = windowsSystemExecutable(
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const taskkillExecutable = windowsSystemExecutable(
    "System32",
    "taskkill.exe",
  );
  let processId: number | undefined;
  let aborted = false;
  let killPromise: Promise<void> | undefined;
  let terminationFailure: string | undefined;
  let stderrPrefix = "";

  const killProcessTree = () => {
    if (processId === undefined || killPromise) return;
    const ownedProcessId = processId;
    killPromise = runShell({
      command: taskkillExecutable,
      args: ["/PID", String(ownedProcessId), "/T", "/F"],
      timeoutMs: 5_000,
      toolName: options.toolName,
    })
      .then(async (result) => {
        if (result.exitCode === 0 && result.sandbox === "host") {
          terminationFailure = await confirmProcessAbsent(ownedProcessId);
          return;
        }
        const detail = result.stderr.trim().slice(0, 500);
        terminationFailure = `taskkill exited with code ${result.exitCode}${
          detail ? `: ${detail}` : "."
        }`;
      })
      .catch((error) => {
        terminationFailure = `taskkill failed: ${boundedErrorMessage(error)}`;
      });
  };
  const abort = () => {
    aborted = true;
    killProcessTree();
  };
  const onStderr = (chunk: string) => {
    if (processId !== undefined) {
      if (!aborted) options.onStderr?.(chunk);
      return;
    }
    stderrPrefix += chunk;
    const newline = stderrPrefix.search(/\r?\n/u);
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
      processId = parsedPid;
      if (aborted) killProcessTree();
      const lineEndingLength = stderrPrefix.startsWith("\r\n", newline) ? 2 : 1;
      const remainder = stderrPrefix.slice(newline + lineEndingLength);
      if (remainder && !aborted) options.onStderr?.(remainder);
      stderrPrefix = "";
      return;
    }
    if (!aborted) options.onStderr?.(stderrPrefix);
    stderrPrefix = "";
  };

  options.abortSignal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await runShell({
      command: powershellExecutable,
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        windowsAbortWrapperScript(command, args),
      ],
      cwd: options.cwd,
      env: definedEnvironment(options.env),
      timeoutMs: options.timeoutMs,
      onStdout: (chunk) => {
        if (!aborted) options.onStdout?.(chunk);
      },
      onStderr,
      toolName: options.toolName,
    });
    const timedOut =
      result.exitCode === 124 &&
      result.stderr.includes("[shell-router] command timed out");
    if (timedOut) killProcessTree();
    await killPromise;
    const stderr = result.stderr.replace(
      new RegExp(`^${PROCESS_ID_MARKER}\\d+\\r?\\n?`, "u"),
      "",
    );
    if ((aborted || timedOut) && processId === undefined) {
      terminationFailure =
        "the routed Windows process ID was unavailable before exit.";
    }
    if ((aborted || timedOut) && terminationFailure) {
      throw new TextProcessTerminationUnconfirmedError(terminationFailure, {
        ...result,
        stderr,
      });
    }
    return {
      ...result,
      exitCode: aborted ? 130 : result.exitCode,
      stderr:
        stderr ||
        (aborted ? "Command cancelled by operator." : stderrPrefix.trim()),
    };
  } catch (error) {
    if (error instanceof TextProcessTerminationUnconfirmedError) throw error;
    if (aborted) {
      await killPromise;
      throw new TextProcessTerminationUnconfirmedError(
        terminationFailure ??
          `The router failed before cancellation could be confirmed: ${boundedErrorMessage(error)}`,
      );
    }
    throw error;
  } finally {
    options.abortSignal?.removeEventListener("abort", abort);
    await killPromise;
  }
}

async function runAbortableHostProcess(
  command: string,
  args: readonly string[],
  options: TextProcessOptions,
): Promise<TextProcessResult> {
  let processGroupId: number | undefined;
  let aborted = false;
  let termination: Promise<string | undefined> | undefined;
  let stderrPrefix = "";

  const terminate = () => {
    if (processGroupId !== undefined && !termination) {
      termination = terminateProcessGroup(processGroupId);
    }
  };
  const abort = () => {
    aborted = true;
    terminate();
  };
  const onStderr = (chunk: string) => {
    if (processGroupId !== undefined) {
      if (!aborted) options.onStderr?.(chunk);
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
      if (aborted) terminate();
      const remainder = stderrPrefix.slice(newline + 1);
      if (remainder && !aborted) options.onStderr?.(remainder);
      stderrPrefix = "";
      return;
    }
    if (!aborted) options.onStderr?.(stderrPrefix);
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
      onStdout: (chunk) => {
        if (!aborted) options.onStdout?.(chunk);
      },
      onStderr,
      toolName: options.toolName,
    });
    const stderr = result.stderr.replace(
      new RegExp(`^${PROCESS_ID_MARKER}\\d+\\r?\\n?`, "u"),
      "",
    );
    const timedOut =
      result.exitCode === 124 &&
      result.stderr.includes("[shell-router] command timed out");
    if (timedOut) terminate();
    if (aborted || timedOut) {
      const failure =
        processGroupId === undefined
          ? "The routed process group ID was unavailable before exit."
          : await termination;
      if (failure) {
        throw new TextProcessTerminationUnconfirmedError(failure, {
          ...result,
          stderr,
        });
      }
    }
    return {
      ...result,
      exitCode: aborted ? 130 : result.exitCode,
      stderr:
        stderr ||
        (aborted ? "Command cancelled by operator." : stderrPrefix.trim()),
    };
  } catch (error) {
    if (error instanceof TextProcessTerminationUnconfirmedError) throw error;
    if (aborted) {
      const failure = await termination;
      throw new TextProcessTerminationUnconfirmedError(
        failure ??
          `The router failed before cancellation could be confirmed: ${boundedErrorMessage(error)}`,
      );
    }
    throw error;
  } finally {
    options.abortSignal?.removeEventListener("abort", abort);
    // The router settling does not prove that background group members stopped.
    await termination;
  }
}
