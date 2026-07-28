import { spawnTextProcess } from "@/services/process-execution";

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
  const { child, completed } = spawnTextProcess("/bin/zsh", [
    "-lc",
    buildShellCommand(command, args),
  ]);
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const { stdout, stderr, exitCode } = await completed;
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
  } finally {
    clearTimeout(timer);
  }
}
