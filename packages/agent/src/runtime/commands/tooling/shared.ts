export function parseNamedToolPayload(
  payload: string,
): { toolName: string; parsedInput: Record<string, unknown> } | undefined {
  const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
  if (!toolName) {
    return undefined;
  }
  if (!inputRaw) {
    return { toolName, parsedInput: {} };
  }
  try {
    return {
      toolName,
      parsedInput: JSON.parse(inputRaw) as Record<string, unknown>,
    };
  } catch {
    // Malformed JSON input — surface a usage message rather than crashing the turn.
    return undefined;
  }
}
