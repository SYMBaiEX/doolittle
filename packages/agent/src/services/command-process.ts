import { runTextProcess } from "@/services/process-execution";

export interface CommandProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildShellCommand(command: string, args: string[]): string {
  const suffix = args.map((arg) => shellQuote(arg)).join(" ");
  return suffix ? `${command} ${suffix}` : command;
}

export async function runShellCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandProcessResult> {
  const { stdout, stderr, exitCode } = await runTextProcess(
    "/bin/zsh",
    ["-lc", buildShellCommand(command, args)],
    {
      timeoutMs,
      toolName: "doolittle.command-process",
    },
  );
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
