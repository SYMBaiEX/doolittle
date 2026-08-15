import { existsSync } from "node:fs";

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resolveLocalShell(): string {
  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/sh"].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? "/bin/sh";
}

export const LOCAL_SHELL = resolveLocalShell();

export function localShellInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): {
  args: string[];
  executable: string;
} {
  if (platform === "win32") {
    return {
      executable: environment.ComSpec?.trim() || "cmd.exe",
      args: ["/D", "/S", "/C", command],
    };
  }
  return { executable: LOCAL_SHELL, args: ["-lc", command] };
}
