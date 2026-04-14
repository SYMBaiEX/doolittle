export function parseNamedToolPayload(
  payload: string,
): { toolName: string; parsedInput: Record<string, unknown> } | undefined {
  const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
  if (!toolName) {
    return undefined;
  }
  return {
    toolName,
    parsedInput: inputRaw
      ? (JSON.parse(inputRaw) as Record<string, unknown>)
      : {},
  };
}
