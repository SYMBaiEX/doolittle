import { runCommand } from "./run";
import { localShellInvocation, shellQuote } from "./shell";
import type { TerminalRunResult } from "./types";

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
  const lookup =
    process.platform === "win32"
      ? `where "${binary.replaceAll('"', '""')}"`
      : `command -v ${shellQuote(binary)}`;
  const shell = localShellInvocation(lookup);
  const result = await runCommand([shell.executable, ...shell.args], {
    timeoutMs,
  }).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
    timedOut: false,
    durationMs: 0,
  }));
  return result.exitCode === 0;
}
