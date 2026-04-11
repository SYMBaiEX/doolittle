export function stringifyCommandResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
