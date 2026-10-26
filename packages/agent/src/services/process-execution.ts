import { Buffer } from "node:buffer";
import path from "node:path";
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

  if (options.abortSignal && resolveShellExecutionMode() === "local-yolo") {
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
    killPromise = runShell({
      command: taskkillExecutable,
      args: ["/PID", String(processId), "/T", "/F"],
      timeoutMs: 5_000,
      toolName: options.toolName,
    })
      .then((result) => {
        if (result.exitCode === 0) return;
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
    await killPromise;
    const stderr = result.stderr.replace(
      new RegExp(`^${PROCESS_ID_MARKER}\\d+\\r?\\n?`, "u"),
      "",
    );
    if (aborted && processId === undefined) {
      terminationFailure =
        "the routed Windows process ID was unavailable before exit.";
    }
    if (aborted && terminationFailure) {
      return {
        ...result,
        exitCode: result.exitCode === 0 ? 1 : result.exitCode,
        stderr: [
          stderr,
          `Command cancellation could not be confirmed; the process tree may have continued: ${terminationFailure}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    return {
      ...result,
      exitCode: aborted ? 130 : result.exitCode,
      stderr:
        stderr ||
        (aborted ? "Command cancelled by operator." : stderrPrefix.trim()),
    };
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
