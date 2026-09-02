export function officialElizaDependencyVersion(
  name: string,
  value: unknown,
): string | undefined {
  if (
    name.includes(">") ||
    (name !== "elizaos" && !name.startsWith("@elizaos/")) ||
    typeof value !== "string" ||
    value.startsWith("workspace:")
  ) {
    return undefined;
  }
  return value;
}
