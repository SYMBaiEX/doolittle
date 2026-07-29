export function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function sanitizeFindQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
}
