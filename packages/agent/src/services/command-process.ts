import { runTextProcess } from "@/services/process-execution";

export interface CommandProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number;
}

export async function runShellCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandProcessResult> {
  const { stdout, stderr, exitCode } = await runTextProcess(command, args, {
    timeoutMs,
    toolName: "doolittle.command-process",
  });
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  return {
    ok: exitCode === 0,
    stdout: trimmedStdout,
    stderr: trimmedStderr,
    output: (exitCode === 0
      ? trimmedStdout
      : trimmedStderr || trimmedStdout
    ).trim(),
    exitCode,
  };
}
