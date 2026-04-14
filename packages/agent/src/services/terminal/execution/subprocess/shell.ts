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
