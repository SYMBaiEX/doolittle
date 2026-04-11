export function nowIso(): string {
  return new Date().toISOString();
}

export function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
