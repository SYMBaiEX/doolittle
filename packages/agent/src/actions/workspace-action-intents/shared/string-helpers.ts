export function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeQuotedSegment(value: string): string | undefined {
  const fenced = value.match(/`([^`\n]+)`/u);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }
  const quoted = value.match(/"([^"\n]+)"|'([^'\n]+)'/u);
  const candidate = quoted?.[1] ?? quoted?.[2];
  return candidate?.trim() || undefined;
}

export function sanitizeFindQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
}
