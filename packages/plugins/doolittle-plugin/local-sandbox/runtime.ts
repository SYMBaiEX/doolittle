export function collectProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
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
      return [process.execPath, ["-e", code]];
    case "typescript":
      return [process.execPath, ["-e", code]];
    case "bash":
    case "sh":
      return ["bash", ["-lc", code]];
    default:
      return ["python3", ["-c", code]];
  }
}
