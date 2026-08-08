const SAFE_SANDBOX_ENVIRONMENT_KEYS = new Set([
  "CI",
  "FORCE_COLOR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "TERM",
  "TZ",
]);

export function collectProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        SAFE_SANDBOX_ENVIRONMENT_KEYS.has(entry[0]) &&
        typeof entry[1] === "string",
    ),
  );
}

export function resolveExecutionCommand(
  language: string,
  code: string,
): [string, string[]] {
  switch (language) {
    case "python":
      return ["python3", ["-c", code]];
    case "javascript":
      return ["node", ["-e", code]];
    case "typescript":
      return ["nub", ["-e", code]];
    case "bash":
    case "sh":
      return ["bash", ["-lc", code]];
    default:
      return ["python3", ["-c", code]];
  }
}
