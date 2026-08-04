export function nowIso(): string {
  return new Date().toISOString();
}

export function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
