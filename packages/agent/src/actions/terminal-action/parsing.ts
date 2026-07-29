function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCommandFromParams(params: unknown): string | undefined {
  const record = params as Record<string, unknown> | undefined;
  if (!record || typeof record !== "object") {
    return undefined;
  }
  return nonEmptyString(record.command);
}
