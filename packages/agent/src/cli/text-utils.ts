export function compactJsonLine(value: unknown): string {
  const raw = JSON.stringify(value);
  return raw.length > 320 ? `${raw.slice(0, 317)}...` : raw;
}

export function truncate(text: string, max = 520): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3))}...`
    : normalized;
}

export function compactPreview(text: string): string {
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return truncate(text, 320);
  }

  try {
    return compactJsonLine(JSON.parse(text) as unknown);
  } catch {
    return truncate(text, 320);
  }
}
