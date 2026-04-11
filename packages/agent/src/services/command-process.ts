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
  const proc = Bun.spawn({
    cmd: ["/bin/zsh", "-lc", buildShellCommand(command, args)],
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
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
