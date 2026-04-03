export function nowIso(): string {
  return new Date().toISOString();
}

export function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

export function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function planningEnvelope<T extends Record<string, unknown>>(
  payload: T,
) {
  return {
    experimental: true,
    executed: false,
    ...payload,
  };
}
