import { runTextProcess } from "../../../process-execution";
import type { TerminalRunOptions, TerminalRunResult } from "./types";

const ROUTER_TIMEOUT_MARKER = "[shell-router] command timed out";

function cancelledResult(): TerminalRunResult {
  return {
    exitCode: 130,
    stdout: "",
    stderr: "Command cancelled before execution.",
    timedOut: false,
    durationMs: 0,
  };
}

export async function runCommand(
  cmd: string[],
  options: TerminalRunOptions,
): Promise<TerminalRunResult> {
  if (options.abortSignal?.aborted) {
    return cancelledResult();
  }

  const result = await runTextProcess(cmd[0] ?? "", cmd.slice(1), {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    abortSignal: options.abortSignal,
    toolName: options.toolName ?? "doolittle.terminal",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    timedOut:
      result.exitCode === 124 && result.stderr.includes(ROUTER_TIMEOUT_MARKER),
    durationMs: result.durationMs,
    sandbox: result.sandbox,
  };
}
